import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// VAPID設定
webpush.setVapidDetails(
  "mailto:kakeibot@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { title, body, excludeUserId } = await request.json();

    if (!title || !body) {
      return NextResponse.json(
        { error: "title と body は必須です" },
        { status: 400 }
      );
    }

    // 全ユーザーの購読を取得（送信者自身を除く）
    let query = supabaseAdmin
      .from("push_subscriptions")
      .select("*");

    if (excludeUserId) {
      query = query.neq("user_id", excludeUserId);
    }

    const { data: subscriptions, error } = await query;

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const payload = JSON.stringify({ title, body, url: "/" });

    // 全購読者に送信
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload
          );
        } catch (err: any) {
          // 410 Gone = 購読が無効 → 削除
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseAdmin
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);
          }
          throw err;
        }
      })
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({ success: true, sent, failed });
  } catch (error) {
    console.error("Push send error:", error);
    return NextResponse.json(
      { error: "通知の送信に失敗しました" },
      { status: 500 }
    );
  }
}
