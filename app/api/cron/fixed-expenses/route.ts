import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processFixedExpenses } from "@/lib/fixed-expenses";
import { verifyCronSecret } from "@/lib/auth";

/**
 * Phase 6-C: 固定費自動反映の Cron ジョブ
 *
 * 元はクライアント側 AppContext の useEffect で起動時に毎回実行していたが、
 * - アプリを開かない日は反映されない
 * - 起動時のネットワーク帯域を圧迫する
 * - 同一ユーザーが複数デバイスで開くと無駄に重複試行
 *
 * Vercel Cron で 1 日 1 回バッチ実行に移行する。
 *
 * 認証: Vercel Cron が `Authorization: Bearer ${CRON_SECRET}` を自動付与する。
 *       CRON_SECRET は Vercel Dashboard の Environment Variables で設定する。
 *       未設定の場合は誰でも叩ける状態になるので、必ず設定すること。
 *
 * 動作: fixed_expenses テーブルから distinct な user_id を取得して、
 *       各ユーザーごとに processFixedExpenses(userId, supabaseAdmin) を実行。
 */

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = ["hnd1"];

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  // ===== 認証 =====
  // verifyCronSecret は CRON_SECRET 未設定なら false を返すため、
  // dev でテストしたいときは Vercel env 経由で CRON_SECRET を設定する必要がある
  if (!verifyCronSecret(request)) {
    console.warn("[cron/fixed-expenses] unauthorized request");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    // ===== アクティブな固定費を持つ全ユーザー ID を取得 =====
    const { data: rows, error: usersError } = await supabaseAdmin
      .from("fixed_expenses")
      .select("user_id")
      .eq("is_active", true);

    if (usersError) {
      console.error("[cron/fixed-expenses] failed to list users:", usersError);
      return NextResponse.json(
        { error: "failed to list users", detail: usersError.message },
        { status: 500 }
      );
    }

    // distinct user_ids
    const userIds = Array.from(
      new Set((rows || []).map((r) => r.user_id).filter(Boolean))
    );

    console.log(`[cron/fixed-expenses] processing ${userIds.length} users`);

    // ===== ユーザーごとに処理 =====
    const summary = {
      users: userIds.length,
      processed: 0,
      skipped: 0,
      errors: [] as Array<{ userId: string; messages: string[] }>,
    };

    for (const userId of userIds) {
      try {
        const result = await processFixedExpenses(userId, supabaseAdmin);
        summary.processed += result.processed;
        summary.skipped += result.skipped;
        if (result.errors.length > 0) {
          summary.errors.push({ userId, messages: result.errors });
        }
        if (result.processed > 0) {
          console.log(
            `[cron/fixed-expenses] user=${userId} processed=${result.processed} skipped=${result.skipped}`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[cron/fixed-expenses] user=${userId} failed:`, msg);
        summary.errors.push({ userId, messages: [msg] });
      }
    }

    const elapsedMs = Date.now() - start;
    console.log(
      `[cron/fixed-expenses] done in ${elapsedMs}ms — users=${summary.users} processed=${summary.processed} skipped=${summary.skipped} errors=${summary.errors.length}`
    );

    return NextResponse.json({
      ok: true,
      elapsedMs,
      ...summary,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[cron/fixed-expenses] FAILED:", msg);
    return NextResponse.json(
      { error: "cron failed", detail: msg },
      { status: 500 }
    );
  }
}
