import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"}/api/auth/google/callback`;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");

  if (!code || !userId) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  try {
    // Authorization code を token に交換
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      console.error("No refresh_token in response:", tokenData);
      // refresh_token が無い場合でも access_token だけ保存する可能性あり
    }

    // user_settings に refresh_token を保存
    const { error } = await supabaseAdmin
      .from("user_settings")
      .upsert(
        {
          user_id: userId,
          google_refresh_token: tokenData.refresh_token || null,
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Supabase upsert error:", error);
      return NextResponse.json({ error: "Failed to save token" }, { status: 500 });
    }

    // アプリに戻す
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
    return NextResponse.redirect(`${appUrl}?google_linked=true`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json({ error: "OAuth callback failed" }, { status: 500 });
  }
}
