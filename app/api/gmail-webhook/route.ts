import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// サーバーサイドでのSupabaseクライアント（Service Role Key使用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GmailWebhookPayload {
  date: string;
  amount: number;
  store: string;
  category_main: string;
  category_sub: string;
  user_type: string;
  secret_key: string;
  memo?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GmailWebhookPayload = await request.json();

    // 必須フィールドの検証
    if (!body.date || !body.amount || !body.store || !body.category_main || !body.category_sub || !body.user_type || !body.secret_key) {
      return NextResponse.json(
        { error: "必須フィールドが不足しています", required: ["date", "amount", "store", "category_main", "category_sub", "user_type", "secret_key"] },
        { status: 400 }
      );
    }

    // シークレットキーで認証
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("user_settings")
      .select("user_id, gmail_integration_enabled")
      .eq("api_secret_key", body.secret_key)
      .single();

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: "認証に失敗しました。シークレットキーが無効です。" },
        { status: 401 }
      );
    }

    // Gmail連携が有効かチェック
    if (!settings.gmail_integration_enabled) {
      return NextResponse.json(
        { error: "Gmail連携が無効になっています。設定から有効にしてください。" },
        { status: 403 }
      );
    }

    // transactionsテーブルにデータを挿入
    const { data: transaction, error: insertError } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: settings.user_id,
        user_type: body.user_type,
        type: "expense",
        amount: body.amount,
        category_main: body.category_main,
        category_sub: body.category_sub,
        store_name: body.store,
        memo: body.memo || `Gmail自動登録: ${body.store}`,
        date: body.date,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Transaction insert error:", insertError);
      return NextResponse.json(
        { error: "データの保存に失敗しました", details: insertError.message },
        { status: 500 }
      );
    }

    // 自分自身にGmail処理成功の通知を送信
    const pushUrl = `${new URL(request.url).origin}/api/push/send`;
    try {
      await fetch(pushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Gmail支出が自動登録されました",
          body: `¥${body.amount.toLocaleString()} (${body.memo || body.store})`,
          targetUserId: settings.user_id,
        }),
      });
    } catch (pushError) {
      console.error("Self push notification error:", pushError);
    }

    // 「共同」支出の場合、パートナーにもPush通知を送信
    if (body.user_type === "共同") {
      try {
        await fetch(pushUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "共同支出が登録されました",
            body: `¥${body.amount.toLocaleString()} (${body.memo || body.store})`,
            excludeUserId: settings.user_id,
          }),
        });
      } catch (pushError) {
        console.error("Partner push notification error:", pushError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "取引が正常に登録されました",
      transaction_id: transaction.id,
      data: {
        date: body.date,
        amount: body.amount,
        store: body.store,
        category: `${body.category_main} / ${body.category_sub}`,
      },
    });
  } catch (error) {
    console.error("Gmail webhook error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

// GETリクエストでヘルスチェック
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Gmail Webhook API is running",
    usage: {
      method: "POST",
      content_type: "application/json",
      required_fields: {
        date: "YYYY-MM-DD形式",
        amount: "数値（円）",
        store: "店舗名",
        category_main: "大カテゴリー",
        category_sub: "小カテゴリー",
        user_type: "共同 / れん / あかね",
        secret_key: "設定画面で確認できるシークレットキー",
      },
      optional_fields: {
        memo: "メモ（省略時は店舗名が入ります）",
      },
    },
  });
}
