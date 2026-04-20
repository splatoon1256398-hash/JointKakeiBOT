import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processFixedExpenses } from "./fixed-expenses";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase クライアントの最低限のモック。
 * - fixed_expenses: select().eq().eq() → { data, error }
 * - transactions:
 *   - select().eq().gte().lte().or() → { data, error }
 *   - insert(rows) → { error }
 * - bank_accounts:
 *   - select().in() → { data, error }
 */
type ExistingEntry = string | { memo: string; user_type?: string };
function makeClient(opts: {
  fixedExpenses: unknown[];
  existingMemos?: ExistingEntry[];
  bankAccounts?: Array<{ id: string; owner_user_type: string }>;
  insertError?: string;
  onInsert?: (rows: unknown[]) => void;
  fixedFetchError?: string;
}) {
  const existing = (opts.existingMemos || []).map((m) =>
    typeof m === "string" ? { memo: m, user_type: "れん" } : { user_type: "れん", ...m },
  );
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
                  or: async () => ({ data: existing, error: null }),
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
      if (table === "bank_accounts") {
        return {
          select: () => ({
            in: async () => ({ data: opts.bankAccounts ?? [], error: null }),
          }),
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
  kind: "expense" as const,
  split_ratio: null,
  bank_account_id: null,
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

  it("budget_transfer (共同, 折半, 共同口座宛) は 各個人 expense + 共同 income", async () => {
    const inserted: Array<{ user_type: string; type: string; amount: number; memo: string }> = [];
    const transfer = {
      ...baseExpense,
      id: "ft1",
      user_type: "共同",
      kind: "budget_transfer" as const,
      amount: 40000,
      category_main: "食費",
      category_sub: "食料品",
      memo: "Revolut送金",
      split_ratio: { "れん": 50, "あかね": 50 },
      bank_account_id: "bank-joint",
    };
    const client = makeClient({
      fixedExpenses: [transfer],
      bankAccounts: [{ id: "bank-joint", owner_user_type: "共同" }],
      onInsert: (rows) => inserted.push(...(rows as typeof inserted)),
    });
    await processFixedExpenses(USER_ID, client);
    expect(inserted).toHaveLength(3);
    // 各個人 expense
    const renExp = inserted.find((r) => r.user_type === "れん" && r.type === "expense");
    const akaneExp = inserted.find((r) => r.user_type === "あかね" && r.type === "expense");
    expect(renExp?.amount).toBe(20000);
    expect(renExp?.memo).toBe("【送金】Revolut送金 (れん分)");
    expect(akaneExp?.amount).toBe(20000);
    // 共同 income
    const jointIncome = inserted.find((r) => r.user_type === "共同" && r.type === "income");
    expect(jointIncome?.amount).toBe(40000);
    expect(jointIncome?.memo).toBe("【送金受取】Revolut送金");
    expect(jointIncome?.type).toBe("income");
  });

  it("budget_transfer の bank_account_id が未設定なら受取 income は登録しない", async () => {
    const inserted: Array<{ user_type: string; type: string }> = [];
    const transfer = {
      ...baseExpense,
      id: "ft-nobank",
      user_type: "共同",
      kind: "budget_transfer" as const,
      amount: 40000,
      split_ratio: { "れん": 50, "あかね": 50 },
      memo: "食費送金",
      bank_account_id: null,
    };
    const client = makeClient({
      fixedExpenses: [transfer],
      onInsert: (rows) => inserted.push(...(rows as typeof inserted)),
    });
    await processFixedExpenses(USER_ID, client);
    // expense 2 件のみ、income は無し
    expect(inserted).toHaveLength(2);
    expect(inserted.every((r) => r.type === "expense")).toBe(true);
  });

  it("budget_transfer (個人→自分の口座) は家計簿に何も登録しない", async () => {
    const inserted: Array<{ user_type: string; type: string }> = [];
    const transfer = {
      ...baseExpense,
      id: "ft-self",
      user_type: "れん",
      kind: "budget_transfer" as const,
      amount: 10000,
      split_ratio: { "れん": 100 },
      memo: "自分用貯金",
      bank_account_id: "bank-ren",
    };
    const client = makeClient({
      fixedExpenses: [transfer],
      bankAccounts: [{ id: "bank-ren", owner_user_type: "れん" }],
      onInsert: (rows) => inserted.push(...(rows as typeof inserted)),
    });
    await processFixedExpenses(USER_ID, client);
    // 同一人物内の口座間振替は家計簿に記録しない
    expect(inserted).toHaveLength(0);
  });

  it("budget_transfer (50:50, 送金先=れん口座) は あかね expense + れん income", async () => {
    const inserted: Array<{ user_type: string; type: string; amount: number }> = [];
    const transfer = {
      ...baseExpense,
      id: "ft-to-ren",
      user_type: "共同",
      kind: "budget_transfer" as const,
      amount: 40000,
      split_ratio: { "れん": 50, "あかね": 50 },
      memo: "れん肩代わり精算",
      bank_account_id: "bank-ren",
    };
    const client = makeClient({
      fixedExpenses: [transfer],
      bankAccounts: [{ id: "bank-ren", owner_user_type: "れん" }],
      onInsert: (rows) => inserted.push(...(rows as typeof inserted)),
    });
    await processFixedExpenses(USER_ID, client);
    // れん分は same-person で expense スキップ、あかね分は expense、れんに income が入る
    expect(inserted).toHaveLength(2);
    const akaneExp = inserted.find((r) => r.user_type === "あかね" && r.type === "expense");
    const renIncome = inserted.find((r) => r.user_type === "れん" && r.type === "income");
    expect(akaneExp?.amount).toBe(20000);
    expect(renIncome?.amount).toBe(20000);
  });

  it("budget_transfer は 既存 【送金】 memo があるとスキップ", async () => {
    const inserted: Array<{ user_type: string; type: string }> = [];
    const transfer = {
      ...baseExpense,
      id: "ft3",
      user_type: "共同",
      kind: "budget_transfer" as const,
      amount: 40000,
      memo: "Revolut送金",
      split_ratio: { "れん": 50, "あかね": 50 },
      bank_account_id: "bank-joint",
    };
    const client = makeClient({
      fixedExpenses: [transfer],
      bankAccounts: [{ id: "bank-joint", owner_user_type: "共同" }],
      // ren 分は既に入っている、akane 分はまだ
      existingMemos: [
        { memo: "【送金】Revolut送金 (れん分)", user_type: "れん" },
      ],
      onInsert: (rows) => inserted.push(...(rows as typeof inserted)),
    });
    await processFixedExpenses(USER_ID, client);
    // あかね分 expense + 共同 income (既存が あかね分だけなので income も新規)
    expect(inserted.find((r) => r.user_type === "あかね" && r.type === "expense")).toBeDefined();
    expect(inserted.find((r) => r.user_type === "共同" && r.type === "income")).toBeDefined();
    // れん分 expense は既存と重複するのでスキップ
    expect(inserted.find((r) => r.user_type === "れん" && r.type === "expense")).toBeUndefined();
  });

  it("budget_transfer は 既存 【送金受取】 があると income 側もスキップ", async () => {
    const inserted: Array<{ user_type: string; type: string }> = [];
    const transfer = {
      ...baseExpense,
      id: "ft-receipt-dedup",
      user_type: "共同",
      kind: "budget_transfer" as const,
      amount: 40000,
      memo: "Revolut送金",
      split_ratio: { "れん": 50, "あかね": 50 },
      bank_account_id: "bank-joint",
    };
    const client = makeClient({
      fixedExpenses: [transfer],
      bankAccounts: [{ id: "bank-joint", owner_user_type: "共同" }],
      existingMemos: [
        { memo: "【送金】Revolut送金 (れん分)", user_type: "れん" },
        { memo: "【送金】Revolut送金 (あかね分)", user_type: "あかね" },
        { memo: "【送金受取】Revolut送金", user_type: "共同" },
      ],
      onInsert: (rows) => inserted.push(...(rows as typeof inserted)),
    });
    await processFixedExpenses(USER_ID, client);
    // 全部既存なので何も insert されない
    expect(inserted).toHaveLength(0);
  });
});
