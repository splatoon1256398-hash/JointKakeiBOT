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

async function checkBudgetAlert(
  userId: string,
  userType: string,
  categoryMain: string,
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
      .eq("user_type", userType)
      .eq("category_main", categoryMain);

    if (!budgets || budgets.length === 0) return;

    const { data: monthExpenses } = await supabaseAdmin
      .from("transactions")
      .select("amount, category_main, items")
      .eq("user_type", userType)
      .eq("type", "expense")
      .gte("date", monthStart)
      .lte("date", monthEnd);

    const spentMap: Record<string, number> = {};
    monthExpenses?.forEach((t) => {
      if (t.items && Array.isArray(t.items) && (t.items as Array<{ categoryMain: string; amount: number }>).length > 0) {
        (t.items as Array<{ categoryMain: string; amount: number }>).forEach((item) => {
          spentMap[item.categoryMain] = (spentMap[item.categoryMain] || 0) + item.amount;
        });
      } else {
        spentMap[t.category_main] = (spentMap[t.category_main] || 0) + t.amount;
      }
    });

    const budget = budgets[0];
    const spent = spentMap[budget.category_main] || 0;
    const pct = budget.monthly_budget > 0 ? (spent / budget.monthly_budget) * 100 : 0;
    const remaining = budget.monthly_budget - spent;

    let alertBody = "";
    let alertType = "";
    if (pct >= 100) {
      alertBody = `⚠️ ${budget.category_main}の予算を超過（¥${(-remaining).toLocaleString()}オーバー）`;
      alertType = "100";
    } else if (pct >= 80) {
      alertBody = `⚠ ${budget.category_main}があと¥${remaining.toLocaleString()}で上限`;
      alertType = "80";
    }

    if (alertBody && alertType) {
      // 月×カテゴリ×タイプで重複チェック
      const { data: existingLog } = await supabaseAdmin
        .from("budget_alert_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("user_type", userType)
        .eq("category_main", budget.category_main)
        .eq("alert_type", alertType)
        .eq("alert_month", alertMonth)
        .maybeSingle();

      if (existingLog) return; // 既に通知済み

      await fetch(`${appUrl}/api/push/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "" },
        body: JSON.stringify({
          title: "予算アラート",
          body: alertBody,
          targetUserId: userId,
          notificationType: "budget_alert",
          url: dateForLink
            ? `/?page=kakeibo&tab=history&date=${dateForLink}`
            : "/?page=kakeibo&tab=analysis",
        }),
      });

      // 送信ログを記録
      await supabaseAdmin.from("budget_alert_logs").insert({
        user_id: userId,
        user_type: userType,
        category_main: budget.category_main,
        alert_type: alertType,
        alert_month: alertMonth,
      });
    }
  } catch (err) {
    console.error("Budget alert check error:", err);
  }
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

    // user_type のバリデーション: 許可された値のみ
    const allowedUserTypes = ["共同", "れん", "あかね"];
    if (!allowedUserTypes.includes(body.user_type)) {
      return NextResponse.json(
        { error: "無効なuser_typeです" },
        { status: 400 }
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
        memo: body.memo || body.store || "",
        date: body.date,
        source: "gmail_webhook",
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
        headers: { "Content-Type": "application/json", "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "" },
        body: JSON.stringify({
          title: "Gmail支出が自動登録されました",
          body: `¥${body.amount.toLocaleString()} (${body.memo || body.store})`,
          targetUserId: settings.user_id,
          url: `/?page=kakeibo&tab=history&date=${body.date.substring(0, 10)}&txId=${transaction.id}`,
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
          headers: { "Content-Type": "application/json", "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "" },
          body: JSON.stringify({
            title: "共同支出が登録されました",
            body: `¥${body.amount.toLocaleString()} (${body.memo || body.store})`,
            excludeUserId: settings.user_id,
            notificationType: "joint_expense_alert",
            url: `/?page=kakeibo&tab=history&date=${body.date.substring(0, 10)}&txId=${transaction.id}`,
          }),
        });
      } catch (pushError) {
        console.error("Partner push notification error:", pushError);
      }
    }

    // 予算アラートチェック
    await checkBudgetAlert(
      settings.user_id,
      body.user_type,
      body.category_main,
      new URL(request.url).origin,
      body.date.substring(0, 10)
    );

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
