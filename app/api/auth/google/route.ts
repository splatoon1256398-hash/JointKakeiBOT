import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signOAuthState } from "@/lib/auth";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"}/api/auth/google/callback`;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: "Google OAuth の設定が未完了です" }, { status: 500 });
    }

    const scopes = [
      "https://www.googleapis.com/auth/gmail.modify",
    ];

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", signOAuthState(user.id));

    return NextResponse.json({ url: authUrl.toString() });
  } catch (error) {
    console.error("Google OAuth start error:", error);
    return NextResponse.json(
      { error: "Google OAuth の開始に失敗しました" },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json(
    { error: "POST で呼び出してください" },
    { status: 405 }
  );
}
