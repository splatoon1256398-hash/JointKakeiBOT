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
  if (data.error) {
    console.error("Google token refresh error:", data.error, data.error_description);
  }
  return data.access_token || null;
}

export async function POST(request: Request) {
  try {
    // Bearer token 認証
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (userId !== user.id) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // refresh_token を取得
    const { data: settings } = await supabaseAdmin
      .from("user_settings")
      .select("google_refresh_token")
      .eq("user_id", userId)
      .single();

    if (!settings?.google_refresh_token) {
      return NextResponse.json({ error: "Google アカウントが未連携です" }, { status: 400 });
    }

    const accessToken = await getAccessToken(settings.google_refresh_token);
    if (!accessToken) {
      return NextResponse.json(
        { error: "アクセストークンの取得に失敗しました。Gmail連携を一度解除して再連携してください。" },
        { status: 500 }
      );
    }

    // Gmail API watch() を呼び出し
    const watchRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: GOOGLE_PUBSUB_TOPIC,
        labelIds: ["INBOX"],
      }),
    });

    const watchData = await watchRes.json();

    if (!watchRes.ok) {
      console.error("Gmail watch error:", watchData);
      return NextResponse.json({ error: "Gmail watch の開始に失敗しました", details: watchData }, { status: 500 });
    }

    // expiration を保存
    const expiration = watchData.expiration
      ? new Date(parseInt(watchData.expiration)).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // expiration と historyId を保存
    const updatePayload: Record<string, string> = { gmail_watch_expiration: expiration };
    if (watchData.historyId) {
      updatePayload.gmail_history_id = String(watchData.historyId);
    }

    await supabaseAdmin
      .from("user_settings")
      .update(updatePayload)
      .eq("user_id", userId);

    return NextResponse.json({
      success: true,
      historyId: watchData.historyId,
      expiration,
    });
  } catch (error) {
    console.error("Watch API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
