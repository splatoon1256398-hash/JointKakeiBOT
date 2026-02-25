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
    const { title, body, excludeUserId, targetUserId, notificationType } = await request.json();

    if (!title || !body) {
      return NextResponse.json(
        { error: "title と body は必須です" },
        { status: 400 }
      );
    }

    // 購読を取得
    let query = supabaseAdmin
      .from("push_subscriptions")
      .select("*");

    // 特定ユーザーに送信する場合
    if (targetUserId) {
      query = query.eq("user_id", targetUserId);
    }

    // 送信者自身を除外する場合
    if (excludeUserId) {
      query = query.neq("user_id", excludeUserId);
    }

    const { data: subscriptions, error } = await query;

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    // 通知種別に応じて、ユーザーの通知設定をチェック
    let filteredSubscriptions = subscriptions;
    if (notificationType) {
      const userIds = [...new Set(subscriptions.map((s) => s.user_id))];
      const { data: settingsRows } = await supabaseAdmin
        .from("user_settings")
        .select("user_id, notification_preferences")
        .in("user_id", userIds);

      const prefsMap: Record<string, Record<string, boolean>> = {};
      settingsRows?.forEach((row) => {
        prefsMap[row.user_id] = row.notification_preferences || {};
      });

      filteredSubscriptions = subscriptions.filter((sub) => {
        const userPrefs = prefsMap[sub.user_id];
        // デフォルトはtrue（設定がない場合は通知する）
        if (!userPrefs) return true;
        return userPrefs[notificationType] !== false;
      });

      if (filteredSubscriptions.length === 0) {
        return NextResponse.json({ success: true, sent: 0, skipped: "notification_preferences" });
      }
    }

    const payload = JSON.stringify({ title, body, url: "/" });

    // 全購読者に送信
    const results = await Promise.allSettled(
      filteredSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload
          );
        } catch (err: unknown) {
          // 410 Gone = 購読が無効 → 削除
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
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
