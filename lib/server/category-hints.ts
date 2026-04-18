import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * カテゴリ自動分類学習 (#1) — few-shot ヒント生成。
 *
 * 過去にユーザが手動修正したカテゴリ履歴 `category_corrections` を読み、
 * AI プロンプト末尾に添える「最近の修正例」ブロックを作る。
 *
 * Option A (軽量 few-shot) 方針のため、embeddings は使わず
 * 直近 N 件をそのままテキスト整形して注入する。
 *
 * N は 12 を初期値とする (Gemini のコンテキストを食いすぎない / しかし
 * 複数店の頻出パターンを拾えるちょうどよいライン)。
 *
 * 呼び出し側: `app/api/chat/route.ts` の systemPrompt に追加。
 * 将来的にはレシートスキャン (`app/api/receipt/route.ts`) にも組み込み予定。
 */

interface CategoryCorrectionRow {
  store_name: string | null;
  memo: string | null;
  corrected_category_main: string;
  corrected_category_sub: string;
}

const DEFAULT_LIMIT = 12;

/**
 * ユーザの修正履歴から few-shot 例を文字列で返す。
 * 履歴が無ければ空文字を返す (呼び出し側は空なら段落ごと省略する)。
 */
export async function buildCategoryHints(
  userId: string,
  client: SupabaseClient,
  opts: { limit?: number } = {}
): Promise<string> {
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const { data, error } = await client
    .from("category_corrections")
    .select("store_name, memo, corrected_category_main, corrected_category_sub")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[category-hints] fetch error:", error.message);
    return "";
  }

  const rows = (data || []) as CategoryCorrectionRow[];
  if (rows.length === 0) return "";

  // 同じ (店名 or メモ) → (大/小カテゴリ) のペアを重複排除しつつ、新しい順を保つ
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const row of rows) {
    const key = `${row.store_name ?? ""}|${row.memo ?? ""}|${row.corrected_category_main}/${row.corrected_category_sub}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const leftBits: string[] = [];
    if (row.store_name) leftBits.push(`店名「${row.store_name}」`);
    if (row.memo) leftBits.push(`メモ「${row.memo}」`);
    if (leftBits.length === 0) continue; // 手がかり無しは捨てる
    lines.push(
      `- ${leftBits.join(" / ")} → ${row.corrected_category_main}/${row.corrected_category_sub}`
    );
  }

  if (lines.length === 0) return "";

  return [
    "【このユーザの過去のカテゴリ修正例（優先して踏襲せよ）】",
    ...lines,
  ].join("\n");
}
