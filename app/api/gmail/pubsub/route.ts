import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseEmailWithAI, shouldProcessEmail } from "@/lib/gmail-ai";

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

  // text/plain パートを探す
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    // fallback: text/html
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Pub/Sub のメッセージからデコード
    const pubsubMessage = body.message;
    if (!pubsubMessage?.data) {
      return NextResponse.json({ error: "No message data" }, { status: 400 });
    }

    const decodedData = JSON.parse(
      Buffer.from(pubsubMessage.data, "base64").toString("utf-8")
    );

    const emailAddress = decodedData.emailAddress;
    const historyId = decodedData.historyId;

    if (!emailAddress) {
      return NextResponse.json({ error: "No email address in notification" }, { status: 400 });
    }

    // user_settings からユーザーを特定（google_refresh_token が存在するユーザー）
    // emailAddress からは直接引けないので、全ユーザーの refresh_token を使って profile を確認するか、
    // 事前に email を保存しておくか。ここでは api_secret_key (user_id) ベースで全対象者をチェック。
    const { data: users } = await supabaseAdmin
      .from("user_settings")
      .select("user_id, google_refresh_token, linked_user_type, api_secret_key")
      .not("google_refresh_token", "is", null);

    if (!users || users.length === 0) {
      return NextResponse.json({ message: "No users with Google linked" });
    }

    // 各ユーザーについて処理を試行
    for (const userSettings of users) {
      try {
        const accessToken = await getAccessToken(userSettings.google_refresh_token);
        if (!accessToken) continue;

        // profile から email を確認
        const profileRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const profile = await profileRes.json();

        if (profile.emailAddress !== emailAddress) continue;

        // 最新メッセージを取得
        const messagesRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&labelIds=INBOX`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const messagesData = await messagesRes.json();

        if (!messagesData.messages || messagesData.messages.length === 0) continue;

        const messageId = messagesData.messages[0].id;
        const message = await getEmailContent(accessToken, messageId);

        const headers = message.payload?.headers || [];
        const subject = extractHeader(headers, "Subject");
        const sender = extractHeader(headers, "From");
        const emailBody = extractEmailBody(message);

        // フィルタ取得
        const { data: filters } = await supabaseAdmin
          .from("gmail_filters")
          .select("filter_type, target_type, keyword")
          .eq("user_id", userSettings.user_id);

        // フィルタ適用
        if (!shouldProcessEmail(subject, sender, filters || [])) {
          console.log(`Filtered out: ${subject}`);
          continue;
        }

        // AI解析
        const parsed = await parseEmailWithAI(emailBody, subject);
        if (!parsed || parsed.amount <= 0) {
          console.log(`Not a transaction email: ${subject}`);
          continue;
        }

        // transactions テーブルに INSERT
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
            source: "gmail_pubsub",
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

        console.log(`Auto-recorded: ${parsed.store} ¥${parsed.amount}`);
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
