import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_PUBSUB_TOPIC = process.env.GOOGLE_PUBSUB_TOPIC || "";

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

/**
 * Vercel Cron Job で毎日実行。
 * gmail_watch_expiration が残り1日以内のユーザーの watch() を自動更新。
 */
export async function GET() {
  try {
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 期限が1日以内、または既に期限切れのユーザーを取得
    const { data: users } = await supabaseAdmin
      .from("user_settings")
      .select("user_id, google_refresh_token, gmail_watch_expiration")
      .not("google_refresh_token", "is", null)
      .or(`gmail_watch_expiration.is.null,gmail_watch_expiration.lte.${oneDayFromNow}`);

    if (!users || users.length === 0) {
      return NextResponse.json({ message: "No users need renewal", renewed: 0 });
    }

    let renewed = 0;
    const errors: string[] = [];

    for (const userSettings of users) {
      try {
        const accessToken = await getAccessToken(userSettings.google_refresh_token);
        if (!accessToken) {
          errors.push(`User ${userSettings.user_id}: Failed to get access token`);
          continue;
        }

        const watchRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/watch",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              topicName: GOOGLE_PUBSUB_TOPIC,
              labelIds: ["INBOX"],
            }),
          }
        );

        const watchData = await watchRes.json();

        if (!watchRes.ok) {
          errors.push(`User ${userSettings.user_id}: watch failed - ${JSON.stringify(watchData)}`);
          continue;
        }

        const expiration = watchData.expiration
          ? new Date(parseInt(watchData.expiration)).toISOString()
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await supabaseAdmin
          .from("user_settings")
          .update({ gmail_watch_expiration: expiration })
          .eq("user_id", userSettings.user_id);

        renewed++;
      } catch (err) {
        errors.push(`User ${userSettings.user_id}: ${String(err)}`);
      }
    }

    return NextResponse.json({ renewed, errors });
  } catch (error) {
    console.error("Renew cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
