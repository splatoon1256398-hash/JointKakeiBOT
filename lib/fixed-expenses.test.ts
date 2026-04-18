import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processFixedExpenses } from "./fixed-expenses";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase クライアントの最低限のモック。
 * - fixed_expenses: select().eq().eq() → { data, error }
 * - transactions:
 *   - select().eq().gte().lte().like() → { data, error }
 *   - insert(rows) → { error }
 */
function makeClient(opts: {
  fixedExpenses: unknown[];
  existingMemos?: string[];
  insertError?: string;
  onInsert?: (rows: unknown[]) => void;
  fixedFetchError?: string;
}) {
  const existing = (opts.existingMemos || []).map((m) => ({ memo: m }));
  return {
    from(table: string) {
      if (table === "fixed_expenses") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: opts.fixedFetchError ? null : opts.fixedExpenses,
                error: opts.fixedFetchError ? { message: opts.fixedFetchError } : null,
              }),
            }),
          }),
        };
      }
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  like: async () => ({ data: existing, error: null }),
                }),
              }),
            }),
          }),
          insert: async (rows: unknown[]) => {
            opts.onInsert?.(rows);
            return { error: opts.insertError ? { message: opts.insertError } : null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

const USER_ID = "user-1";
const baseExpense = {
  id: "fe1",
  user_id: USER_ID,
  user_type: "れん",
  category_main: "住居費",
  category_sub: "家賃",
  amount: 80000,
  payment_day: 1,
  memo: null,
  start_date: null,
  end_date: null,
};

describe("processFixedExpenses", () => {
  beforeEach(() => {
    // 固定費処理は today (実時刻) に依存するので常に 2026-04-17 に固定する
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T03:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("inserts fixed expense whose payment_day has passed", async () => {
    const inserted: unknown[] = [];
    const client = makeClient({
      fixedExpenses: [baseExpense],
      onInsert: (rows) => inserted.push(...rows),
    });

    const result = await processFixedExpenses(USER_ID, client);
    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      user_id: USER_ID,
      user_type: "れん",
      type: "expense",
      amount: 80000,
      category_main: "住居費",
      category_sub: "家賃",
      memo: "【固定費】家賃", // memo null なら category_sub を使う
      date: "2026-04-01",
    });
  });

  it("skips when payment_day is later this month", async () => {
    const client = makeClient({
      fixedExpenses: [{ ...baseExpense, payment_day: 27 }],
    });
    const result = await processFixedExpenses(USER_ID, client);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("skips when the new-format memo already exists this month", async () => {
    const client = makeClient({
      fixedExpenses: [baseExpense],
      existingMemos: ["【固定費】家賃"],
    });
    const result = await processFixedExpenses(USER_ID, client);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("skips when the legacy-format memo already exists this month", async () => {
    const client = makeClient({
      fixedExpenses: [baseExpense],
      existingMemos: ["【固定費】住居費/家賃"],
    });
    const result = await processFixedExpenses(USER_ID, client);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("skips expenses outside start_date / end_date window", async () => {
    const client = makeClient({
      fixedExpenses: [
        { ...baseExpense, id: "a", start_date: "2026-05-01" },      // まだ始まってない
        { ...baseExpense, id: "b", end_date: "2026-03-31" },        // もう終わってる
      ],
    });
    const result = await processFixedExpenses(USER_ID, client);
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("writes the correct payment date for month-end", async () => {
    // 2026 年 4 月 (30 日まで) に payment_day=30 → 4/30 が記録される
    vi.setSystemTime(new Date("2026-04-30T03:00:00Z"));
    const inserted: { date?: string }[] = [];
    const client = makeClient({
      fixedExpenses: [{ ...baseExpense, payment_day: 30 }],
      onInsert: (rows) => inserted.push(...(rows as { date?: string }[])),
    });
    const result = await processFixedExpenses(USER_ID, client);
    expect(result.processed).toBe(1);
    expect(inserted[0].date).toBe("2026-04-30");
  });

  it("uses memo in the key when present", async () => {
    const inserted: { memo?: string }[] = [];
    const client = makeClient({
      fixedExpenses: [{ ...baseExpense, memo: "4月分" }],
      onInsert: (rows) => inserted.push(...(rows as { memo?: string }[])),
    });
    await processFixedExpenses(USER_ID, client);
    expect(inserted[0].memo).toBe("【固定費】4月分");
  });

  it("surfaces Supabase fetch errors without inserting", async () => {
    const client = makeClient({
      fixedExpenses: [],
      fixedFetchError: "boom",
    });
    const result = await processFixedExpenses(USER_ID, client);
    expect(result.errors).toEqual(["固定費取得エラー: boom"]);
    expect(result.processed).toBe(0);
  });

  it("surfaces Supabase insert errors", async () => {
    const client = makeClient({
      fixedExpenses: [baseExpense],
      insertError: "duplicate key",
    });
    const result = await processFixedExpenses(USER_ID, client);
    expect(result.errors[0]).toContain("固定費 bulk 登録エラー");
    expect(result.processed).toBe(0);
  });
});
