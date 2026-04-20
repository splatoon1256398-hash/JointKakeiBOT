import { describe, it, expect } from "vitest";
import {
  computeTransferSummary,
  normalizeSplitRatio,
  inferSplitPreset,
  buildSplitRatio,
  getMonthBounds,
  type BankAccount,
  type FixedExpenseRow,
  type FixedExpenseTransferRow,
} from "./transfers";

const makeAccount = (
  id: string,
  owner: "れん" | "あかね" | "共同",
  name = `${owner}口座`,
  extras: Partial<BankAccount> = {},
): BankAccount => ({
  id,
  user_id: "u1",
  owner_user_type: owner,
  account_name: name,
  bank_name: null,
  branch_name: null,
  account_last4: null,
  color: "#4f46e5",
  icon: "🏦",
  sort_order: 0,
  is_active: true,
  is_main: false,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
  ...extras,
});

const makeExpense = (
  overrides: Partial<FixedExpenseRow> & Pick<FixedExpenseRow, "id" | "amount" | "user_type">,
): FixedExpenseRow => ({
  user_id: "u1",
  category_main: "住居費",
  category_sub: "家賃",
  payment_day: 10,
  memo: null,
  is_active: true,
  start_date: null,
  end_date: null,
  created_at: null,
  updated_at: null,
  bank_account_id: null,
  source_bank_account_id: null,
  split_ratio: null,
  transfer_required: true,
  kind: "expense",
  ...overrides,
});

describe("normalizeSplitRatio", () => {
  it("NULL + user_type=共同 → 50:50", () => {
    expect(normalizeSplitRatio(null, "共同")).toEqual({ "れん": 50, "あかね": 50 });
  });
  it("NULL + user_type=れん → れん100", () => {
    expect(normalizeSplitRatio(null, "れん")).toEqual({ "れん": 100 });
  });
  it("NULL + user_type=あかね → あかね100", () => {
    expect(normalizeSplitRatio(null, "あかね")).toEqual({ "あかね": 100 });
  });
  it("明示値が優先される", () => {
    expect(normalizeSplitRatio({ "れん": 30, "あかね": 70 }, "共同")).toEqual({
      "れん": 30,
      "あかね": 70,
    });
  });
  it("部分値 (れんのみ) も保持する", () => {
    expect(normalizeSplitRatio({ "れん": 100 }, "共同")).toEqual({ "れん": 100 });
  });
});

describe("inferSplitPreset / buildSplitRatio", () => {
  it("50:50 → joint_5050", () => {
    expect(inferSplitPreset({ "れん": 50, "あかね": 50 })).toBe("joint_5050");
  });
  it("100:0 → ren_full", () => {
    expect(inferSplitPreset({ "れん": 100, "あかね": 0 })).toBe("ren_full");
  });
  it("0:100 → akane_full", () => {
    expect(inferSplitPreset({ "れん": 0, "あかね": 100 })).toBe("akane_full");
  });
  it("40:60 → custom", () => {
    expect(inferSplitPreset({ "れん": 40, "あかね": 60 })).toBe("custom");
  });
  it("buildSplitRatio(joint_5050) は {50,50}", () => {
    expect(buildSplitRatio("joint_5050", 0, 0)).toEqual({ "れん": 50, "あかね": 50 });
  });
  it("buildSplitRatio(custom, 40, 60) は {40,60}", () => {
    expect(buildSplitRatio("custom", 40, 60)).toEqual({ "れん": 40, "あかね": 60 });
  });
});

describe("getMonthBounds", () => {
  it("2026-04 → 01〜30", () => {
    expect(getMonthBounds("2026-04-01")).toEqual({ start: "2026-04-01", end: "2026-04-30" });
  });
  it("閏年 2024-02 → 01〜29", () => {
    expect(getMonthBounds("2024-02-01")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
});

describe("computeTransferSummary", () => {
  const renAccount = makeAccount("acc-ren", "れん", "れん みずほ");
  const akaneAccount = makeAccount("acc-akane", "あかね", "あかね ゆうちょ");
  const jointAccount = makeAccount("acc-joint", "共同", "共同 楽天");
  const accounts = [renAccount, akaneAccount, jointAccount];
  const targetMonth = "2026-04-01";

  it("家賃 50:50 + ren口座引落 → akane は ren へ半額振込、ren は振込不要", () => {
    const rent = makeExpense({
      id: "fe-rent",
      user_type: "共同",
      amount: 50000,
      bank_account_id: "acc-ren",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const summaryAkane = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summaryAkane.grandTotalPayable).toBe(25000);
    expect(summaryAkane.payableByMe).toHaveLength(1);
    expect(summaryAkane.payableByMe[0]?.payee).toBe("れん");
    expect(summaryAkane.payableByMe[0]?.rows[0]?.payerAmount).toBe(25000);

    const summaryRen = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summaryRen.grandTotalPayable).toBe(0);
    expect(summaryRen.grandTotalReceivable).toBe(25000);
  });

  it("個人固定費 (akane 100% + akane口座) は source 未設定でも振込画面に出る (口座準備用)", () => {
    const phone = makeExpense({
      id: "fe-phone",
      user_type: "あかね",
      amount: 5000,
      bank_account_id: "acc-akane",
      split_ratio: { "あかね": 100 },
    });
    const summary = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [phone],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    // 個人固定費は月初に口座へ入金する必要があるのでサマリーに出す
    expect(summary.grandTotalPayable).toBe(5000);
    expect(summary.payableByMe).toHaveLength(1);
    expect(summary.payableByMe[0]?.bankAccount.id).toBe("acc-akane");
  });

  it("共同口座引落 50:50 → ren と akane どちらも共同に振込", () => {
    const utility = makeExpense({
      id: "fe-utility",
      user_type: "共同",
      amount: 12000,
      bank_account_id: "acc-joint",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const summaryRen = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [utility],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summaryRen.grandTotalPayable).toBe(6000);
    expect(summaryRen.payableByMe[0]?.payee).toBe("共同");

    const summaryAkane = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [utility],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summaryAkane.grandTotalPayable).toBe(6000);
    expect(summaryAkane.payableByMe[0]?.payee).toBe("共同");
  });

  it("振込済みレコードがあると isPaid=true、合計残高から差し引く", () => {
    const rent = makeExpense({
      id: "fe-rent",
      user_type: "共同",
      amount: 50000,
      bank_account_id: "acc-ren",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const netflix = makeExpense({
      id: "fe-netflix",
      user_type: "共同",
      amount: 1500,
      bank_account_id: "acc-ren",
      split_ratio: { "れん": 30, "あかね": 70 },
    });
    const paidTransfer: FixedExpenseTransferRow = {
      id: "t1",
      fixed_expense_id: "fe-rent",
      target_month: targetMonth,
      payer_user_type: "あかね",
      amount: 25000,
      bank_account_id: "acc-ren",
      transferred_at: "2026-04-05T00:00:00Z",
      created_by: "u1",
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z",
    };
    const summary = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [rent, netflix],
      bankAccounts: accounts,
      transfers: [paidTransfer],
      targetMonth,
    });
    expect(summary.grandUnpaidCount).toBe(1); // Netflix のみ未完
    expect(summary.grandTotalPayable).toBe(1050); // 25000 は支払済み
    const group = summary.payableByMe[0];
    expect(group?.totalAmount).toBe(26050);
    expect(group?.paidAmount).toBe(25000);
    expect(group?.remainingAmount).toBe(1050);
  });

  it("期間外 (end_date < 月初) の固定費は対象外", () => {
    const rent = makeExpense({
      id: "fe-rent",
      user_type: "共同",
      amount: 50000,
      bank_account_id: "acc-ren",
      split_ratio: { "れん": 50, "あかね": 50 },
      end_date: "2026-03-31",
    });
    const summary = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summary.grandTotalPayable).toBe(0);
  });

  it("transfer_required=false は対象外", () => {
    const rent = makeExpense({
      id: "fe-rent",
      user_type: "共同",
      amount: 50000,
      bank_account_id: "acc-ren",
      split_ratio: { "れん": 50, "あかね": 50 },
      transfer_required: false,
    });
    const summary = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summary.grandTotalPayable).toBe(0);
  });

  it("bank_account_id=null は対象外", () => {
    const rent = makeExpense({
      id: "fe-rent",
      user_type: "共同",
      amount: 50000,
      bank_account_id: null,
    });
    const summary = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summary.grandTotalPayable).toBe(0);
  });

  it("source_bank_account_id がセットされた同一オーナーの口座間振替はサマリーに出る", () => {
    const renMainAccount = makeAccount("acc-ren-main", "れん", "れん メイン");
    const renRentAccount = makeAccount("acc-ren-rent", "れん", "れん 家賃用");
    const accountsWithExtra = [renMainAccount, renRentAccount, akaneAccount, jointAccount];
    const personalRent = makeExpense({
      id: "fe-personal-rent",
      user_type: "れん",
      amount: 60000,
      bank_account_id: "acc-ren-rent",
      source_bank_account_id: "acc-ren-main",
      split_ratio: { "れん": 100 },
    });
    const summary = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [personalRent],
      bankAccounts: accountsWithExtra,
      transfers: [],
      targetMonth,
    });
    expect(summary.grandTotalPayable).toBe(60000);
    const row = summary.payableByMe[0]?.rows[0];
    expect(row?.sourceBankAccount?.id).toBe("acc-ren-main");
    expect(row?.bankAccount?.id).toBe("acc-ren-rent");
    expect(row?.payerAmount).toBe(60000);
  });

  it("source と dest が同じ口座なら除外 (無意味な振替)", () => {
    const selfToSelf = makeExpense({
      id: "fe-self",
      user_type: "れん",
      amount: 1000,
      bank_account_id: "acc-ren",
      source_bank_account_id: "acc-ren",
      split_ratio: { "れん": 100 },
    });
    const summary = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [selfToSelf],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summary.grandTotalPayable).toBe(0);
  });

  it("共同 50:50 で payer===owner の自己振込分はスキップ (他方は表示)", () => {
    const rent = makeExpense({
      id: "fe-rent-own",
      user_type: "共同",
      amount: 60000,
      bank_account_id: "acc-ren",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const summaryRen = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    // れん 50% + 自分の口座 → 自己振込なので表示しない
    expect(summaryRen.grandTotalPayable).toBe(0);

    const summaryAkane = computeTransferSummary({
      currentUser: "あかね",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    // あかね 50% → れん口座 へ振込必要
    expect(summaryAkane.grandTotalPayable).toBe(30000);
  });

  it("グループは bank_account ごとに分かれる", () => {
    const rent = makeExpense({
      id: "fe-rent",
      user_type: "共同",
      amount: 80000,
      bank_account_id: "acc-joint",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const food = makeExpense({
      id: "fe-food",
      user_type: "共同",
      amount: 40000,
      bank_account_id: "acc-akane",
      split_ratio: { "れん": 50, "あかね": 50 },
      kind: "budget_transfer",
    });
    const summary = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [rent, food],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    // 2 グループ (共同口座、あかね口座) に分かれる
    expect(summary.payableByMe).toHaveLength(2);
    const jointGroup = summary.payableByMe.find((g) => g.bankAccount.id === "acc-joint");
    const akaneGroup = summary.payableByMe.find((g) => g.bankAccount.id === "acc-akane");
    expect(jointGroup?.totalAmount).toBe(40000);
    expect(akaneGroup?.totalAmount).toBe(20000);
  });

  it("is_main=true の自分口座への自己振込はスキップ (メイン口座は放置OK)", () => {
    const mainAccount = makeAccount("acc-ren-main", "れん", "住信SBI メイン", { is_main: true });
    const subAccount = makeAccount("acc-ren-sub", "れん", "楽天銀行 費目用", { is_main: false });
    const accountsWithMain = [mainAccount, subAccount, akaneAccount, jointAccount];
    const amazonSub = makeExpense({
      id: "fe-amazon",
      user_type: "れん",
      amount: 661,
      bank_account_id: "acc-ren-main",
      split_ratio: { "れん": 100 },
    });
    const insurance = makeExpense({
      id: "fe-insurance",
      user_type: "れん",
      amount: 14000,
      bank_account_id: "acc-ren-sub",
      split_ratio: { "れん": 100 },
    });
    const summary = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [amazonSub, insurance],
      bankAccounts: accountsWithMain,
      transfers: [],
      targetMonth,
    });
    // is_main=true の口座 (住信SBI) への自己振込は出ない、サブ口座 (楽天銀行) だけ出る
    expect(summary.grandTotalPayable).toBe(14000);
    expect(summary.payableByMe).toHaveLength(1);
    expect(summary.payableByMe[0]?.bankAccount.id).toBe("acc-ren-sub");
  });

  it("受取側に 自分→自分 の行は出ない (受取は他人からのみ)", () => {
    const subAccount = makeAccount("acc-ren-sub", "れん", "楽天銀行");
    const accountsWithSub = [subAccount, akaneAccount, jointAccount];
    const personalInsurance = makeExpense({
      id: "fe-personal-insurance",
      user_type: "れん",
      amount: 14000,
      bank_account_id: "acc-ren-sub",
      split_ratio: { "れん": 100 },
    });
    const summary = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [personalInsurance],
      bankAccounts: accountsWithSub,
      transfers: [],
      targetMonth,
    });
    // payable には出る
    expect(summary.grandTotalPayable).toBe(14000);
    // receivable には出ない (自分→自分は受取ではない)
    expect(summary.grandTotalReceivable).toBe(0);
    expect(summary.receivableByMe).toHaveLength(0);
  });

  it("グループソート: 共同口座が先、個人口座が後", () => {
    const rentJoint = makeExpense({
      id: "fe-rent-joint",
      user_type: "共同",
      amount: 80000,
      bank_account_id: "acc-joint",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const rentAkane = makeExpense({
      id: "fe-rent-akane",
      user_type: "共同",
      amount: 30000,
      bank_account_id: "acc-akane",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const summary = computeTransferSummary({
      currentUser: "れん",
      fixedExpenses: [rentAkane, rentJoint],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    expect(summary.payableByMe[0]?.bankAccount.id).toBe("acc-joint");
    expect(summary.payableByMe[1]?.bankAccount.id).toBe("acc-akane");
  });

  it("共同モードでは家庭内総額 (ren + akane) を合算", () => {
    const rent = makeExpense({
      id: "fe-rent",
      user_type: "共同",
      amount: 50000,
      bank_account_id: "acc-joint",
      split_ratio: { "れん": 50, "あかね": 50 },
    });
    const summary = computeTransferSummary({
      currentUser: "共同",
      fixedExpenses: [rent],
      bankAccounts: accounts,
      transfers: [],
      targetMonth,
    });
    // 共同モード: ren 25000 + akane 25000 = 50000
    expect(summary.grandTotalPayable).toBe(50000);
  });
});
