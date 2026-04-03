import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    const { transactionId } = await request.json();
    if (typeof transactionId !== "string" || !transactionId.trim()) {
      return NextResponse.json({ error: "transactionId は必須です" }, { status: 400 });
    }

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from("transactions")
      .select("id, user_id, user_type, date, amount, store_name, category_main")
      .eq("id", transactionId)
      .single();

    if (transactionError || !transaction) {
      return NextResponse.json({ error: "対象のトランザクションが見つかりません" }, { status: 404 });
    }

    if (transaction.user_id !== user.id || transaction.user_type !== "共同") {
      return NextResponse.json(
        { error: "この共同支出通知は送信できません" },
        { status: 403 }
      );
    }

    if (!process.env.INTERNAL_API_SECRET) {
      return NextResponse.json(
        { error: "INTERNAL_API_SECRET が設定されていません" },
        { status: 500 }
      );
    }

    const actorName = typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name.trim()
      : (user.email?.split("@")[0] ?? "ユーザー");
    const transactionDate = typeof transaction.date === "string"
      ? transaction.date.substring(0, 10)
      : "";
    const subject = transaction.store_name || transaction.category_main || "支出";

    const pushResponse = await fetch(`${new URL(request.url).origin}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        title: "共同支出が登録されました",
        body: `${actorName}が共同支出を登録: ${subject} ¥${Number(transaction.amount).toLocaleString()}`,
        excludeUserId: user.id,
        notificationType: "joint_expense_alert",
        url: `/?page=kakeibo&tab=history&date=${transactionDate}&txId=${transaction.id}`,
      }),
    });

    if (!pushResponse.ok) {
      const pushError = await pushResponse.text();
      console.error("Joint expense push proxy error:", pushError);
      return NextResponse.json({ error: "通知の送信に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Joint expense notification error:", error);
    return NextResponse.json(
      { error: "共同支出通知の送信に失敗しました" },
      { status: 500 }
    );
  }
}
