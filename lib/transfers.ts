import type { Tables, Json } from "@/lib/database.types";

export type BankAccount = Tables<"bank_accounts">;
export type FixedExpenseRow = Tables<"fixed_expenses">;
export type FixedExpenseTransferRow = Tables<"fixed_expense_transfers">;

export type OwnerUserType = "れん" | "あかね" | "共同";
export type PayerUserType = "れん" | "あかね";

export const PAYER_USER_TYPES: readonly PayerUserType[] = ["れん", "あかね"] as const;
export const OWNER_USER_TYPES: readonly OwnerUserType[] = ["れん", "あかね", "共同"] as const;

export function isPayerUserType(v: string | null | undefined): v is PayerUserType {
  return v === "れん" || v === "あかね";
}

export function isOwnerUserType(v: string | null | undefined): v is OwnerUserType {
  return v === "れん" || v === "あかね" || v === "共同";
}

export type SplitRatio = Partial<Record<PayerUserType, number>>;

export type SplitPreset = "joint_5050" | "ren_full" | "akane_full" | "custom";

export interface TransferSummaryRow {
  fixedExpenseId: string;
  label: string;
  categoryMain: string;
  categoryIcon: string;
  paymentDay: number;
  amountTotal: number;
  sourceBankAccount: BankAccount | null;
  bankAccount: BankAccount | null;
  payer: PayerUserType;
  payee: OwnerUserType;
  payerAmount: number;
  targetMonth: string;
  isPaid: boolean;
  transferId: string | null;
}

export interface TransferSummaryGroup {
  payee: OwnerUserType;
  rows: TransferSummaryRow[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

export interface TransferSummary {
  payableByMe: TransferSummaryGroup[];
  receivableByMe: TransferSummaryGroup[];
  grandTotalPayable: number;
  grandTotalReceivable: number;
  grandUnpaidCount: number;
}

export function normalizeSplitRatio(
  rawRatio: Json | null | undefined,
  userType: string,
): SplitRatio {
  if (rawRatio && typeof rawRatio === "object" && !Array.isArray(rawRatio)) {
    const out: SplitRatio = {};
    const ren = (rawRatio as Record<string, unknown>)["れん"];
    const akane = (rawRatio as Record<string, unknown>)["あかね"];
    if (typeof ren === "number") out["れん"] = ren;
    if (typeof akane === "number") out["あかね"] = akane;
    if (out["れん"] !== undefined || out["あかね"] !== undefined) {
      return out;
    }
  }
  if (userType === "共同") return { "れん": 50, "あかね": 50 };
  if (userType === "れん") return { "れん": 100 };
  if (userType === "あかね") return { "あかね": 100 };
  return {};
}

export function inferSplitPreset(ratio: SplitRatio): SplitPreset {
  const ren = ratio["れん"] ?? 0;
  const akane = ratio["あかね"] ?? 0;
  if (ren === 50 && akane === 50) return "joint_5050";
  if (ren === 100 && akane === 0) return "ren_full";
  if (ren === 0 && akane === 100) return "akane_full";
  return "custom";
}

export function buildSplitRatio(preset: SplitPreset, ren: number, akane: number): SplitRatio {
  switch (preset) {
    case "joint_5050":
      return { "れん": 50, "あかね": 50 };
    case "ren_full":
      return { "れん": 100, "あかね": 0 };
    case "akane_full":
      return { "れん": 0, "あかね": 100 };
    case "custom":
      return { "れん": ren, "あかね": akane };
  }
}

export function formatTargetMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function getMonthBounds(targetMonth: string): { start: string; end: string } {
  // targetMonth: 'YYYY-MM-01'
  const [yStr, mStr] = targetMonth.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${yStr}-${mStr}-01`,
    end: `${yStr}-${mStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

function isExpenseActiveForMonth(
  expense: FixedExpenseRow,
  monthStart: string,
  monthEnd: string,
): boolean {
  if (expense.is_active === false) return false;
  if (expense.start_date && expense.start_date > monthEnd) return false;
  if (expense.end_date && expense.end_date < monthStart) return false;
  return true;
}

function computePayerAmount(totalAmount: number, ratio: SplitRatio, payer: PayerUserType): number {
  const pct = ratio[payer] ?? 0;
  return Math.round((totalAmount * pct) / 100);
}

export interface ComputeTransferSummaryInput {
  currentUser: OwnerUserType;
  fixedExpenses: FixedExpenseRow[];
  bankAccounts: BankAccount[];
  transfers: FixedExpenseTransferRow[];
  targetMonth: string; // 'YYYY-MM-01'
  categoryIcons?: Record<string, string>;
}

export function computeTransferSummary(input: ComputeTransferSummaryInput): TransferSummary {
  const { currentUser, fixedExpenses, bankAccounts, transfers, targetMonth, categoryIcons } = input;
  const { start, end } = getMonthBounds(targetMonth);

  const accountById = new Map(bankAccounts.map((a) => [a.id, a]));
  const transferKey = (fe: string, payer: PayerUserType) => `${fe}__${payer}`;
  const transferByKey = new Map(
    transfers
      .filter((t) => t.target_month === targetMonth && isPayerUserType(t.payer_user_type))
      .map((t) => [transferKey(t.fixed_expense_id, t.payer_user_type as PayerUserType), t]),
  );

  const allRows: TransferSummaryRow[] = [];

  for (const expense of fixedExpenses) {
    if (!isExpenseActiveForMonth(expense, start, end)) continue;
    if (expense.transfer_required === false) continue;
    if (!expense.bank_account_id) continue;

    const account = accountById.get(expense.bank_account_id) ?? null;
    if (!account) continue;
    if (!isOwnerUserType(account.owner_user_type)) continue;

    const sourceAccount = expense.source_bank_account_id
      ? accountById.get(expense.source_bank_account_id) ?? null
      : null;
    // 同じ口座への振込は意味がないので除外
    if (sourceAccount && sourceAccount.id === account.id) continue;

    const payee: OwnerUserType = account.owner_user_type;
    const ratio = normalizeSplitRatio(expense.split_ratio, expense.user_type);

    for (const payer of PAYER_USER_TYPES) {
      const payerPct = ratio[payer] ?? 0;
      if (payerPct <= 0) continue;
      // source が設定されていない従来データ: 同一人物の口座なら振込不要とみなす
      // source が設定されていれば「どの口座から → どの口座へ」が明示されているので同一オーナーでも表示する
      if (!sourceAccount && payee === payer) continue;

      const payerAmount = computePayerAmount(expense.amount, ratio, payer);
      if (payerAmount <= 0) continue;

      const existing = transferByKey.get(transferKey(expense.id, payer)) ?? null;
      allRows.push({
        fixedExpenseId: expense.id,
        label: expense.memo || expense.category_sub,
        categoryMain: expense.category_main,
        categoryIcon: categoryIcons?.[expense.category_main] ?? "📦",
        paymentDay: expense.payment_day,
        amountTotal: expense.amount,
        sourceBankAccount: sourceAccount,
        bankAccount: account,
        payer,
        payee,
        payerAmount,
        targetMonth,
        isPaid: Boolean(existing),
        transferId: existing?.id ?? null,
      });
    }
  }

  const groupBy = (rows: TransferSummaryRow[]): TransferSummaryGroup[] => {
    const byPayee = new Map<OwnerUserType, TransferSummaryRow[]>();
    for (const r of rows) {
      const arr = byPayee.get(r.payee) ?? [];
      arr.push(r);
      byPayee.set(r.payee, arr);
    }
    const groups: TransferSummaryGroup[] = [];
    for (const [payee, groupRows] of byPayee) {
      const totalAmount = groupRows.reduce((s, r) => s + r.payerAmount, 0);
      const paidAmount = groupRows.reduce((s, r) => s + (r.isPaid ? r.payerAmount : 0), 0);
      groups.push({
        payee,
        rows: groupRows.sort((a, b) => a.paymentDay - b.paymentDay),
        totalAmount,
        paidAmount,
        remainingAmount: totalAmount - paidAmount,
      });
    }
    return groups.sort((a, b) => a.payee.localeCompare(b.payee));
  };

  const payableRows = isPayerUserType(currentUser)
    ? allRows.filter((r) => r.payer === currentUser)
    : allRows; // 共同モードでは全行を payable として扱い、家庭内総額を表示
  const receivableRows = isPayerUserType(currentUser)
    ? allRows.filter((r) => r.payee === currentUser)
    : [];

  const payableByMe = groupBy(payableRows);
  const receivableByMe = groupBy(receivableRows);

  const grandTotalPayable = payableByMe.reduce((s, g) => s + g.remainingAmount, 0);
  const grandTotalReceivable = receivableByMe.reduce((s, g) => s + g.remainingAmount, 0);
  const grandUnpaidCount = payableRows.filter((r) => !r.isPaid).length;

  return {
    payableByMe,
    receivableByMe,
    grandTotalPayable,
    grandTotalReceivable,
    grandUnpaidCount,
  };
}
