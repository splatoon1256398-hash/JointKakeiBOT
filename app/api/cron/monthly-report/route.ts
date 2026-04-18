import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { verifyCronSecret } from "@/lib/auth";

/**
 * Feature #7: 月次 AI レポート
 *
 * 毎月 1 日 9:00 JST (= 0:00 UTC) に Vercel Cron 経由で叩かれる。
 *
 * 対象: 先月 (= この cron が叩かれた時刻から 1 ヶ月前) に取引が 1 件以上ある
 *       すべての (user_id, user_type) ペア。
 *
 * 動作:
 *   1. 先月分の transactions を集計
 *   2. Gemini に要約プロンプトを投げて summary_text を生成
 *   3. monthly_reports に UPSERT (UNIQUE (user_id, user_type, year, month))
 *   4. そのユーザに Push 通知 (notificationType: "monthly_report")
 *
 * 冪等性: UNIQUE 制約で同じ月の重複生成を防ぐ (再実行しても既存行を上書きしない)。
 *
 * 認証: verifyCronSecret (CRON_SECRET env)。
 */

export const runtime = "nodejs";
export const maxDuration = 300; // Gemini 呼び出し × ユーザ数分あるので長めに
export const preferredRegion = ["hnd1"];

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface TxnRow {
  user_id: string;
  user_type: string;
  type: string;
  amount: number;
  category_main: string;
  category_sub: string;
}

interface Aggregate {
  user_id: string;
  user_type: string;
  total_expense: number;
  total_income: number;
  by_main: Record<string, number>;
  by_sub: Record<string, number>;
  count: number;
}

/** 先月の JST 範囲 (YYYY-MM-DD) と年月 */
function getLastMonthRange(now: Date): {
  start: string;
  end: string;
  year: number;
  month: number;
} {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth(); // 0-indexed "先月"
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${firstDay.getUTCFullYear()}-${pad(firstDay.getUTCMonth() + 1)}-01`,
    end: `${lastDay.getUTCFullYear()}-${pad(lastDay.getUTCMonth() + 1)}-${pad(lastDay.getUTCDate())}`,
    year: firstDay.getUTCFullYear(),
    month: firstDay.getUTCMonth() + 1,
  };
}

/** 集計: (user_id, user_type) ごとに分割し合計を出す */
function aggregateTransactions(rows: TxnRow[]): Aggregate[] {
  const map = new Map<string, Aggregate>();
  for (const r of rows) {
    const key = `${r.user_id}::${r.user_type}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        user_id: r.user_id,
        user_type: r.user_type,
        total_expense: 0,
        total_income: 0,
        by_main: {},
        by_sub: {},
        count: 0,
      };
      map.set(key, agg);
    }
    agg.count += 1;
    if (r.type === "expense") {
      agg.total_expense += r.amount;
      agg.by_main[r.category_main] = (agg.by_main[r.category_main] || 0) + r.amount;
      const subKey = `${r.category_main}/${r.category_sub}`;
      agg.by_sub[subKey] = (agg.by_sub[subKey] || 0) + r.amount;
    } else if (r.type === "income") {
      agg.total_income += r.amount;
    }
  }
  return Array.from(map.values());
}

/** Gemini で要約テキストを作る。失敗時はフォールバック生成 */
async function generateSummary(
  agg: Aggregate,
  year: number,
  month: number,
  prevTotal: number
): Promise<string> {
  const topCategories = Object.entries(agg.by_main)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat, amt]) => `${cat}: ¥${amt.toLocaleString()}`)
    .join("\n");

  const diffText =
    prevTotal > 0
      ? `前月比 ${Math.round((agg.total_expense - prevTotal) / prevTotal * 100)}%`
      : "前月データなし";

  const prompt = `あなたは家計簿パーソナル執事 AI です。以下の ${year}年${month}月の集計を見て、
ユーザ (${agg.user_type}) 向けの短い振り返りレポートを日本語で書いてください。

- 合計支出: ¥${agg.total_expense.toLocaleString()}
- 合計収入: ¥${agg.total_income.toLocaleString()}
- トップカテゴリ:
${topCategories}
- ${diffText}

要件:
- 200文字以内
- 数字を必ず1つ以上含める
- 「〜でしたね」などの柔らかい口調
- 次月に向けた具体的アドバイスを1つ添える
- 絵文字は0-2個まで
- マークダウン・表は使わない
- 冒頭に「${year}年${month}月の振り返り」と入れる`;

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = (res.text ?? "").trim();
    if (text) return text;
  } catch (err) {
    console.warn("[monthly-report] Gemini failed, using fallback:", err);
  }

  // フォールバック: AI 失敗時の素の要約
  return [
    `${year}年${month}月の振り返り`,
    `合計支出 ¥${agg.total_expense.toLocaleString()} / 収入 ¥${agg.total_income.toLocaleString()}。`,
    prevTotal > 0 ? diffText : "",
    topCategories ? `多かったカテゴリ:\n${topCategories}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Push 通知を内部 API 経由で投げる */
async function sendReportPush(
  request: NextRequest,
  userId: string,
  year: number,
  month: number
): Promise<void> {
  try {
    const origin = new URL(request.url).origin;
    await fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({
        title: `${year}年${month}月の家計レポートが届きました`,
        body: "タップしてチャット画面で振り返りを確認しよう",
        targetUserId: userId,
        notificationType: "monthly_report",
        url: `/?page=chat&report=${year}-${String(month).padStart(2, "0")}`,
      }),
    });
  } catch (err) {
    console.warn("[monthly-report] push failed:", err);
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    console.warn("[cron/monthly-report] unauthorized");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const now = new Date();
  const range = getLastMonthRange(now);
  const prevRange = (() => {
    // range の前月 (= 2ヶ月前)
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = jst.getUTCFullYear();
    const m = jst.getUTCMonth();
    const firstDay = new Date(Date.UTC(y, m - 2, 1));
    const lastDay = new Date(Date.UTC(y, m - 1, 0));
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      start: `${firstDay.getUTCFullYear()}-${pad(firstDay.getUTCMonth() + 1)}-01`,
      end: `${lastDay.getUTCFullYear()}-${pad(lastDay.getUTCMonth() + 1)}-${pad(lastDay.getUTCDate())}`,
    };
  })();

  console.log(
    `[cron/monthly-report] range=${range.start}..${range.end} (year=${range.year} month=${range.month})`
  );

  // 先月分の transactions を取得
  const { data: rows, error } = await supabaseAdmin
    .from("transactions")
    .select("user_id, user_type, type, amount, category_main, category_sub")
    .gte("date", range.start)
    .lte("date", range.end);

  if (error) {
    console.error("[cron/monthly-report] fetch failed:", error);
    return NextResponse.json(
      { error: "fetch failed", detail: error.message },
      { status: 500 }
    );
  }

  const aggregates = aggregateTransactions((rows || []) as TxnRow[]);
  if (aggregates.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, note: "no transactions" });
  }

  // 前月分 (= 2ヶ月前) の合計も集計 — 比較用
  const { data: prevRows } = await supabaseAdmin
    .from("transactions")
    .select("user_id, user_type, type, amount")
    .eq("type", "expense")
    .gte("date", prevRange.start)
    .lte("date", prevRange.end);

  const prevTotalMap = new Map<string, number>();
  for (const r of (prevRows || []) as TxnRow[]) {
    const key = `${r.user_id}::${r.user_type}`;
    prevTotalMap.set(key, (prevTotalMap.get(key) || 0) + r.amount);
  }

  let generated = 0;
  const errors: Array<{ user_id: string; user_type: string; msg: string }> = [];

  for (const agg of aggregates) {
    try {
      const prevTotal = prevTotalMap.get(`${agg.user_id}::${agg.user_type}`) || 0;
      const summary = await generateSummary(agg, range.year, range.month, prevTotal);

      const topList = Object.entries(agg.by_main)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([main, amount]) => ({ main, amount }));

      const diffPct =
        prevTotal > 0
          ? Math.round((agg.total_expense - prevTotal) / prevTotal * 100)
          : null;

      const { error: upsertErr } = await supabaseAdmin
        .from("monthly_reports")
        .upsert(
          {
            user_id: agg.user_id,
            user_type: agg.user_type,
            year: range.year,
            month: range.month,
            summary_text: summary,
            total_expense: agg.total_expense,
            total_income: agg.total_income,
            top_categories: topList,
            prev_comparison: { prev_total: prevTotal, diff_pct: diffPct },
          },
          { onConflict: "user_id,user_type,year,month" }
        );

      if (upsertErr) {
        errors.push({
          user_id: agg.user_id,
          user_type: agg.user_type,
          msg: upsertErr.message,
        });
        continue;
      }

      generated += 1;
      await sendReportPush(request, agg.user_id, range.year, range.month);
    } catch (e) {
      errors.push({
        user_id: agg.user_id,
        user_type: agg.user_type,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const elapsedMs = Date.now() - start;
  console.log(
    `[cron/monthly-report] done in ${elapsedMs}ms — generated=${generated} errors=${errors.length}`
  );

  return NextResponse.json({
    ok: true,
    elapsedMs,
    year: range.year,
    month: range.month,
    generated,
    errors,
  });
}
