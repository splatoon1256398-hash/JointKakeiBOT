import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseEmailWithAI, shouldProcessEmail, CategoryDefinition } from "@/lib/gmail-ai";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

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

function extractEmailBody(message: any): string {
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

function extractHeader(headers: any[], name: string): string {
  const header = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || "";
}

/**
 * 重複排除: messageId が既に処理済みかチェック
 * transactions テーブルの source カラムに "gmail_pubsub:<messageId>" を記録して判定
 */
async function isMessageAlreadyProcessed(messageId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("source", `gmail_pubsub:${messageId}`)
    .limit(1);
  return (data && data.length > 0) || false;
}

/**
 * DB からカテゴリ一覧を取得して AI に渡す形式に変換
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const pubsubMessage = body.message;
    if (!pubsubMessage?.data) {
      return NextResponse.json({ error: "No message data" }, { status: 400 });
    }

    const decodedData = JSON.parse(
      Buffer.from(pubsubMessage.data, "base64").toString("utf-8")
    );

    const emailAddress = decodedData.emailAddress;

    if (!emailAddress) {
      return NextResponse.json({ error: "No email address in notification" }, { status: 400 });
    }

    const { data: users } = await supabaseAdmin
      .from("user_settings")
      .select("user_id, google_refresh_token, linked_user_type, api_secret_key")
      .not("google_refresh_token", "is", null);

    if (!users || users.length === 0) {
      return NextResponse.json({ message: "No users with Google linked" });
    }

    // カテゴリ一覧を事前に取得（全ユーザー共通）
    const categoryDefs = await fetchCategoryDefinitions();

    for (const userSettings of users) {
      try {
        const accessToken = await getAccessToken(userSettings.google_refresh_token);
        if (!accessToken) continue;

        const profileRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const profile = await profileRes.json();

        if (profile.emailAddress !== emailAddress) continue;

        // 最新メッセージを取得
        const messagesRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3&labelIds=INBOX`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const messagesData = await messagesRes.json();

        if (!messagesData.messages || messagesData.messages.length === 0) continue;

        // 最新3件を処理対象にし、重複チェック
        for (const msg of messagesData.messages) {
          const messageId: string = msg.id;

          // 重複排除: 既に処理済みならスキップ
          if (await isMessageAlreadyProcessed(messageId)) {
            console.log(`Already processed messageId: ${messageId}`);
            continue;
          }

          const message = await getEmailContent(accessToken, messageId);

          const headers = message.payload?.headers || [];
          const subject = extractHeader(headers, "Subject");
          const sender = extractHeader(headers, "From");
          const emailBody = extractEmailBody(message);

          // フィルタ取得・適用
          const { data: filters } = await supabaseAdmin
            .from("gmail_filters")
            .select("filter_type, target_type, keyword")
            .eq("user_id", userSettings.user_id);

          if (!shouldProcessEmail(subject, sender, filters || [])) {
            console.log(`Filtered out: ${subject}`);
            continue;
          }

          // AI解析（カテゴリ一覧付き）
          const parsed = await parseEmailWithAI(emailBody, subject, categoryDefs);
          if (!parsed || parsed.amount <= 0) {
            console.log(`Not a transaction email: ${subject}`);
            continue;
          }

          // transactions テーブルに INSERT（source に messageId を記録）
          const userType = userSettings.linked_user_type || "共同";
          const { error: insertError } = await supabaseAdmin
            .from("transactions")
            .insert({
              user_id: userSettings.user_id,
              user_type: userType,
              type: "expense",
              date: parsed.date,
              category_main: parsed.category_main,
              category_sub: parsed.category_sub,
              store_name: parsed.store,
              amount: parsed.amount,
              memo: parsed.memo || `Gmail自動: ${subject.substring(0, 50)}`,
              source: `gmail_pubsub:${messageId}`,
            });

          if (insertError) {
            console.error("Transaction insert error:", insertError);
            continue;
          }

          // Push 通知を本人に送信
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
            await fetch(`${appUrl}/api/push/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: "自動記録完了",
                body: `${parsed.store || "不明"}での決済(¥${parsed.amount.toLocaleString()})を自動記録しました`,
                targetUserId: userSettings.user_id,
              }),
            });
          } catch (pushError) {
            console.error("Push notification error:", pushError);
          }

          console.log(`Auto-recorded [${messageId}]: ${parsed.store} ¥${parsed.amount}`);
        }
      } catch (userError) {
        console.error(`Error processing user ${userSettings.user_id}:`, userError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pub/Sub handler error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
