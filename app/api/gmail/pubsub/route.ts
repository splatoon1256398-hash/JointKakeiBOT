import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseEmailWithAI, shouldProcessEmail, CategoryDefinition } from "@/lib/gmail-ai";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const PROCESSED_LABEL_NAME = "Kakeibo/Processed";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

async function getEmailContent(accessToken: string, messageId: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.json();
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  labelIds?: string[];
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
}

interface GmailLabel {
  id: string;
  name: string;
}

function extractEmailBody(message: GmailMessage): string {
  const payload = message.payload;
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64").toString("utf-8");
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  return "";
}

function extractHeader(headers: GmailHeader[], name: string): string {
  const header = headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || "";
}

/**
 * DB重複排除: messageId を原子的にロックして重複処理を防止
 * return true = 新規（処理OK）、false = 既に処理済み（スキップ）
 */
async function tryLockMessage(userId: string, messageId: string): Promise<boolean> {
  // gmail_processed_messages に UNIQUE(user_id, message_id) 制約あり
  // insert が成功すれば未処理、失敗すれば既に処理済み
  const { error } = await supabaseAdmin
    .from("gmail_processed_messages")
    .insert({ user_id: userId, message_id: messageId });
  if (error) {
    // unique violation = 既に処理済み
    return false;
  }
  return true;
}

/**
 * DB からカテゴリ一覧を取得
 */
async function fetchCategoryDefinitions(): Promise<CategoryDefinition[]> {
  const { data } = await supabaseAdmin
    .from("categories")
    .select("main_category, subcategories")
    .order("sort_order");

  if (!data) return [];
  return data.map((c) => ({
    main_category: c.main_category,
    subcategories: c.subcategories || [],
  }));
}

/**
 * Gmail ラベル ID を取得（なければ作成）
 */
async function getOrCreateLabelId(accessToken: string): Promise<string | null> {
  try {
    // 既存ラベルを検索
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = (await listRes.json()) as {
      labels?: GmailLabel[];
    };
    const existing = listData.labels?.find(
      (l) => l.name === PROCESSED_LABEL_NAME,
    );
    if (existing) return existing.id;

    // なければ新規作成
    const createRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: PROCESSED_LABEL_NAME,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      }
    );
    const createData = await createRes.json();
    return createData.id || null;
  } catch (err) {
    console.error("Label get/create error:", err);
    return null;
  }
}

/**
 * メールにラベルがついているか確認
 */
function hasLabel(message: GmailMessage, labelId: string): boolean {
  return message.labelIds?.includes(labelId) || false;
}

/**
 * メールにラベルを付与
 */
async function addLabelToMessage(
  accessToken: string,
  messageId: string,
  labelId: string
): Promise<void> {
  await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        addLabelIds: [labelId],
      }),
    }
  );
}

/**
 * 予算アラートチェック: 支出追加後にカテゴリ予算の80%/100%超過を検出しPush通知
 */
async function checkBudgetAlert(
  userId: string,
  userType: string,
  parsedItems: { category_main: string; amount: number }[],
  appUrl: string,
  dateForLink?: string
): Promise<void> {
  try {
    const now = new Date();
    const alertMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = `${alertMonth}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthEnd = `${alertMonth}-${String(lastDay.getDate()).padStart(2, "0")}`;

    const { data: budgets } = await supabaseAdmin
      .from("budgets")
      .select("category_main, monthly_budget")
      .eq("user_type", userType);

    if (!budgets || budgets.length === 0) return;

    // 今追加した支出のカテゴリのみチェック
    const affectedCategories = new Set(parsedItems.map((i) => i.category_main));
    const relevantBudgets = budgets.filter((b) => affectedCategories.has(b.category_main));
    if (relevantBudgets.length === 0) return;

    const { data: monthExpenses } = await supabaseAdmin
      .from("transactions")
      .select("amount, category_main, items")
      .eq("user_type", userType)
      .eq("type", "expense")
      .gte("date", monthStart)
      .lte("date", monthEnd);

    const spentMap: Record<string, number> = {};
    monthExpenses?.forEach((t) => {
      if (t.items && Array.isArray(t.items) && t.items.length > 0) {
        (t.items as Array<{ categoryMain: string; amount: number }>).forEach((item) => {
          spentMap[item.categoryMain] = (spentMap[item.categoryMain] || 0) + item.amount;
        });
      } else {
        spentMap[t.category_main] = (spentMap[t.category_main] || 0) + t.amount;
      }
    });

    // 既存のアラートログを取得
    const { data: existingLogs } = await supabaseAdmin
      .from("budget_alert_logs")
      .select("category_main, alert_type")
      .eq("user_id", userId)
      .eq("user_type", userType)
      .eq("alert_month", alertMonth);

    const sentSet = new Set(
      (existingLogs || []).map((l) => `${l.category_main}:${l.alert_type}`)
    );

    const alerts: string[] = [];
    const newLogs: { user_id: string; user_type: string; category_main: string; alert_type: string; alert_month: string }[] = [];

    for (const budget of relevantBudgets) {
      const spent = spentMap[budget.category_main] || 0;
      const pct = budget.monthly_budget > 0 ? (spent / budget.monthly_budget) * 100 : 0;
      const remaining = budget.monthly_budget - spent;

      if (pct >= 100 && !sentSet.has(`${budget.category_main}:100`)) {
        alerts.push(`⚠️ ${budget.category_main}の予算を超過（¥${(-remaining).toLocaleString()}オーバー）`);
        newLogs.push({ user_id: userId, user_type: userType, category_main: budget.category_main, alert_type: "100", alert_month: alertMonth });
      } else if (pct >= 80 && pct < 100 && !sentSet.has(`${budget.category_main}:80`)) {
        alerts.push(`⚠ ${budget.category_main}があと¥${remaining.toLocaleString()}で上限`);
        newLogs.push({ user_id: userId, user_type: userType, category_main: budget.category_main, alert_type: "80", alert_month: alertMonth });
      }
    }

    if (alerts.length > 0) {
      await fetch(`${appUrl}/api/push/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "" },
        body: JSON.stringify({
          title: "予算アラート",
          body: alerts.join("\n"),
          targetUserId: userId,
          notificationType: "budget_alert",
          url: dateForLink
            ? `/?page=kakeibo&tab=history&date=${dateForLink}`
            : "/?page=kakeibo&tab=analysis",
        }),
      });

      // 送信ログを記録
      if (newLogs.length > 0) {
        await supabaseAdmin.from("budget_alert_logs").insert(newLogs);
      }
    }
  } catch (err) {
    console.error("Budget alert check error:", err);
  }
}

export async function POST(request: Request) {
  try {
    // PUBSUB_TOKEN による認証（Pub/Sub サブスクリプション URL に ?token=xxx を付与）
    const { searchParams } = new URL(request.url);
    const pubsubToken = searchParams.get("token");
    if (!pubsubToken || pubsubToken !== process.env.PUBSUB_TOKEN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const pubsubMessage = body.message;
    if (!pubsubMessage?.data) {
      return NextResponse.json({ error: "No message data" }, { status: 400 });
    }

    const decodedData = JSON.parse(
      Buffer.from(pubsubMessage.data, "base64").toString("utf-8")
    );

    const emailAddress = decodedData.emailAddress;
    const notificationHistoryId = decodedData.historyId;

    if (!emailAddress) {
      return NextResponse.json({ error: "No email address in notification" }, { status: 400 });
    }

    const { data: users } = await supabaseAdmin
      .from("user_settings")
      .select("user_id, google_refresh_token, linked_user_type, api_secret_key, gmail_auto_processing, gmail_history_id")
      .not("google_refresh_token", "is", null);

    if (!users || users.length === 0) {
      return NextResponse.json({ message: "No users with Google linked" });
    }

    const categoryDefs = await fetchCategoryDefinitions();

    for (const userSettings of users) {
      try {
        // gmail_auto_processing が明示的に false の場合はスキップ
        if (userSettings.gmail_auto_processing === false) continue;

        const accessToken = await getAccessToken(userSettings.google_refresh_token);
        if (!accessToken) continue;

        const profileRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const profile = await profileRes.json();

        if (profile.emailAddress !== emailAddress) continue;

        // 処理済みラベルを取得 or 作成
        const processedLabelId = await getOrCreateLabelId(accessToken);

        // historyId ベースの増分同期
        const storedHistoryId = userSettings.gmail_history_id;
        let messageIds: string[] = [];

        if (storedHistoryId) {
          // 増分同期: history.list で新着メッセージIDを取得
          const historyRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${storedHistoryId}&historyTypes=messageAdded&labelId=INBOX`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const historyData = await historyRes.json();

          if (historyRes.status === 404) {
            // historyId が古すぎる場合はフォールバック
            const messagesRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3&labelIds=INBOX`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const messagesData = await messagesRes.json();
            messageIds = (messagesData.messages || []).map((m: { id: string }) => m.id);
          } else if (historyData.history) {
            // history から messagesAdded を抽出
            const idSet = new Set<string>();
            for (const h of historyData.history) {
              if (h.messagesAdded) {
                for (const added of h.messagesAdded) {
                  if (added.message?.id) idSet.add(added.message.id);
                }
              }
            }
            messageIds = Array.from(idSet);
          }
        } else {
          // historyId 未保存: フォールバック（従来通り最新3件）
          const messagesRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3&labelIds=INBOX`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const messagesData = await messagesRes.json();
          messageIds = (messagesData.messages || []).map((m: { id: string }) => m.id);
        }

        if (messageIds.length === 0) {
          // メッセージなしでも historyId を更新
          if (notificationHistoryId) {
            await supabaseAdmin
              .from("user_settings")
              .update({ gmail_history_id: notificationHistoryId })
              .eq("user_id", userSettings.user_id);
          }
          continue;
        }

        for (const messageId of messageIds) {

          // DB重複排除（原子的ロック）
          if (!(await tryLockMessage(userSettings.user_id, messageId))) {
            console.log(`Already processed (DB lock) messageId: ${messageId}`);
            continue;
          }

          const message = await getEmailContent(accessToken, messageId);

          // Gmail ラベル重複排除
          if (processedLabelId && hasLabel(message, processedLabelId)) {
            console.log(`Already processed (Label) messageId: ${messageId}`);
            continue;
          }

          const headers = message.payload?.headers || [];
          const subject = extractHeader(headers, "Subject");
          const sender = extractHeader(headers, "From");
          const emailBody = extractEmailBody(message);

          // メールの受信日を取得（internalDate = Unixミリ秒）
          let receivedDate: string | undefined;
          if (message.internalDate) {
            const d = new Date(parseInt(message.internalDate, 10));
            receivedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          } else {
            const dateHeader = extractHeader(headers, "Date");
            if (dateHeader) {
              const d = new Date(dateHeader);
              if (!isNaN(d.getTime())) {
                receivedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              }
            }
          }

          // フィルタ適用
          const { data: filters } = await supabaseAdmin
            .from("gmail_filters")
            .select("filter_type, target_type, keyword")
            .eq("user_id", userSettings.user_id);

          if (!shouldProcessEmail(subject, sender, filters || [])) {
            console.log(`Filtered out: ${subject}`);
            continue;
          }

          // AI解析（複数商品対応）
          const parsedItems = await parseEmailWithAI(emailBody, subject, categoryDefs, receivedDate);
          if (!parsedItems || parsedItems.length === 0) {
            console.log(`Not a transaction email: ${subject}`);
            continue;
          }

          // 各商品を個別トランザクションとしてINSERT
          const userType = userSettings.linked_user_type || "共同";
          let insertedCount = 0;
          let firstInsertedTxId: string | null = null;

          for (const item of parsedItems) {
            const { data: inserted, error: insertError } = await supabaseAdmin
              .from("transactions")
              .insert({
                user_id: userSettings.user_id,
                user_type: userType,
                type: "expense",
                date: item.date,
                category_main: item.category_main,
                category_sub: item.category_sub,
                store_name: item.store,
                amount: item.amount,
                memo: item.memo || item.store || "",
                source: `gmail_pubsub:${messageId}`,
              })
              .select("id")
              .single();

            if (insertError) {
              console.error("Transaction insert error:", insertError);
            } else {
              insertedCount++;
              if (!firstInsertedTxId) {
                firstInsertedTxId = inserted?.id || null;
              }
            }
          }

          // 成功したらラベルを付与
          if (insertedCount > 0 && processedLabelId) {
            await addLabelToMessage(accessToken, messageId, processedLabelId);
          }

          // Push通知
          if (insertedCount > 0) {
            try {
              const totalAmount = parsedItems.reduce((s, i) => s + i.amount, 0);
              const storeName = parsedItems[0]?.store || "不明";
              const itemCount = parsedItems.length > 1 ? `(${parsedItems.length}件)` : "";
              const dateForLink = parsedItems[0]?.date?.substring(0, 10);
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
              await fetch(`${appUrl}/api/push/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "" },
                body: JSON.stringify({
                  title: "自動記録完了",
                  body: `${storeName}${itemCount}での決済(¥${totalAmount.toLocaleString()})を自動記録しました`,
                  targetUserId: userSettings.user_id,
                  url: dateForLink
                    ? `/?page=kakeibo&tab=history&date=${dateForLink}${firstInsertedTxId ? `&txId=${firstInsertedTxId}` : ""}`
                    : "/?page=kakeibo&tab=history",
                }),
              });

              // 予算アラートチェック
              await checkBudgetAlert(userSettings.user_id, userType, parsedItems, appUrl, dateForLink);
            } catch (pushError) {
              console.error("Push notification error:", pushError);
            }
          }

          console.log(`Auto-recorded [${messageId}]: ${insertedCount} items from "${subject}"`);
        }

        // 処理完了後に historyId を更新
        if (notificationHistoryId) {
          await supabaseAdmin
            .from("user_settings")
            .update({ gmail_history_id: notificationHistoryId })
            .eq("user_id", userSettings.user_id);
        }
      } catch (userError) {
        console.error(`Error processing user ${userSettings.user_id}:`, userError);
        // エラー時は historyId を更新しない（次回リトライで再処理可能）
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pub/Sub handler error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
