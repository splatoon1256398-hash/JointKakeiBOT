import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { subscription, userId } = await request.json();

    if (!subscription || !userId) {
      return NextResponse.json(
        { error: "subscription と userId は必須です" },
        { status: 400 }
      );
    }

    // 既存の購読を確認（同じエンドポイント）
    const { data: existing } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .single();

    if (existing) {
      // 既存の購読を更新
      const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .update({
          user_id: userId,
          keys: subscription.keys,
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      // 新規登録
      const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .insert({
          user_id: userId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json(
      { error: "購読の保存に失敗しました" },
      { status: 500 }
    );
  }
}
