"use client";

import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, ChevronLeft, ChevronRight, Loader2, Check, Calendar, Landmark } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { useTransferSummary } from "@/lib/use-transfer-summary";
import {
  formatTargetMonth,
  isPayerUserType,
  type TransferSummaryRow,
} from "@/lib/transfers";

interface TransferSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function shiftMonth(targetMonth: string, delta: number): string {
  const [y, m] = targetMonth.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1 + delta, 1);
  return formatTargetMonth(d);
}

function labelMonth(targetMonth: string): string {
  const [y, m] = targetMonth.split("-");
  return `${y}年${m}月`;
}

export function TransferSummaryDialog({ open, onOpenChange }: TransferSummaryDialogProps) {
  const { user, theme, displayName } = useApp();
  const [targetMonth, setTargetMonth] = useState(() => formatTargetMonth(new Date()));
  const { summary, loading, refetch } = useTransferSummary(targetMonth);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleTransfer = useCallback(
    async (row: TransferSummaryRow) => {
      if (!user) return;
      setTogglingId(`${row.fixedExpenseId}__${row.payer}`);
      try {
        if (row.isPaid && row.transferId) {
          await supabase.from("fixed_expense_transfers").delete().eq("id", row.transferId);
        } else {
          await supabase.from("fixed_expense_transfers").insert({
            fixed_expense_id: row.fixedExpenseId,
            target_month: row.targetMonth,
            payer_user_type: row.payer,
            amount: row.payerAmount,
            bank_account_id: row.bankAccount?.id ?? null,
            transferred_at: new Date().toISOString(),
            created_by: user.id,
          });
        }
        await refetch();
      } catch (e) {
        console.error("振込記録の更新エラー:", e);
      } finally {
        setTogglingId(null);
      }
    },
    [user, refetch],
  );

  const hasAnyRows = useMemo(() => {
    if (!summary) return false;
    return summary.payableByMe.length > 0 || summary.receivableByMe.length > 0;
  }, [summary]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl max-h-[92vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border-slate-700"
        style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Banknote className="h-5 w-5" style={{ color: theme.primary }} />
            今月の振込予定
          </DialogTitle>
        </DialogHeader>

        {/* 月セレクタ */}
        <div className="flex items-center justify-between bg-slate-800/50 rounded-xl px-3 py-2 mt-2">
          <button
            onClick={() => setTargetMonth((t) => shiftMonth(t, -1))}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
            aria-label="前月"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5 text-white">
            <Calendar className="h-4 w-4 text-white/50" />
            <span className="text-sm font-semibold">{labelMonth(targetMonth)}</span>
          </div>
          <button
            onClick={() => setTargetMonth((t) => shiftMonth(t, 1))}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
            aria-label="翌月"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading && !summary ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        ) : !summary || !hasAnyRows ? (
          <div className="text-center py-10 text-white/50">
            <Banknote className="h-10 w-10 mx-auto mb-2 text-white/20" />
            <p className="text-sm">この月の振込予定はありません</p>
            <p className="text-[11px] mt-1 text-white/30">
              固定費に引落口座と配分が設定されると、ここに表示されます
            </p>
          </div>
        ) : (
          <div className="space-y-3 mt-1">
            {/* 合計カード */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className="rounded-xl p-3"
                style={{ background: `${theme.primary}15`, border: `1px solid ${theme.primary}40` }}
              >
                <p className="text-[10px] text-white/50">あなたが振り込む</p>
                <p className="text-xl font-bold text-white tabular-nums">
                  ¥{summary.grandTotalPayable.toLocaleString()}
                </p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  未完 {summary.grandUnpaidCount} 件
                </p>
              </div>
              <div className="rounded-xl p-3 bg-slate-800/50 border border-slate-700/50">
                <p className="text-[10px] text-white/50">あなたが受け取る</p>
                <p className="text-xl font-bold text-white tabular-nums">
                  ¥{summary.grandTotalReceivable.toLocaleString()}
                </p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  {summary.receivableByMe.reduce((s, g) => s + g.rows.length, 0)} 件
                </p>
              </div>
            </div>

            {/* 振込する側（あなた→他） */}
            {summary.payableByMe.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-white/70 px-1">
                  あなたが振り込む
                </h3>
                {summary.payableByMe.map((group) => (
                  <div
                    key={group.payee}
                    className="rounded-xl bg-slate-800/40 border border-slate-700/50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white/70">→</span>
                        <span className="text-sm font-semibold text-white">{group.payee} へ</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white tabular-nums">
                          残 ¥{group.remainingAmount.toLocaleString()}
                        </p>
                        {group.paidAmount > 0 && (
                          <p className="text-[10px] text-white/40">
                            済 ¥{group.paidAmount.toLocaleString()} / ¥{group.totalAmount.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-white/5">
                      {group.rows.map((row) => {
                        const isToggling = togglingId === `${row.fixedExpenseId}__${row.payer}`;
                        // 自分 (displayName) の振込だけ toggle できる
                        const canToggle = isPayerUserType(displayName)
                          ? row.payer === displayName
                          : true;
                        return (
                          <div
                            key={`${row.fixedExpenseId}-${row.payer}`}
                            className={`flex items-center gap-2 px-3 py-2 ${
                              row.isPaid ? "opacity-60" : ""
                            }`}
                          >
                            <span className="text-base">{row.categoryIcon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{row.label}</p>
                              <p className="text-[10px] text-white/40 truncate">
                                <Landmark className="inline h-2.5 w-2.5 mr-0.5" />
                                {row.sourceBankAccount ? (
                                  <>
                                    {row.sourceBankAccount.account_name}
                                    <span className="text-white/30 mx-0.5">→</span>
                                  </>
                                ) : null}
                                {row.bankAccount?.account_name ?? "—"} · 毎月
                                {row.paymentDay}日
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-white tabular-nums mr-2">
                              ¥{row.payerAmount.toLocaleString()}
                            </p>
                            <button
                              onClick={() => canToggle && toggleTransfer(row)}
                              disabled={!canToggle || isToggling}
                              className={`h-7 w-7 rounded-md flex items-center justify-center border transition-all ${
                                row.isPaid
                                  ? "border-green-500/40 bg-green-500/20 text-green-300"
                                  : "border-white/15 bg-white/5 text-white/30 hover:text-white hover:bg-white/10"
                              } ${!canToggle ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                              aria-label={row.isPaid ? "振込済みを取消" : "振込済みにする"}
                            >
                              {isToggling ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : row.isPaid ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* 受け取る側 */}
            {summary.receivableByMe.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-white/70 px-1">
                  あなたが受け取る
                </h3>
                {summary.receivableByMe.map((group) => (
                  <div
                    key={`rx-${group.payee}`}
                    className="rounded-xl bg-slate-800/30 border border-slate-700/40 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40">
                      <span className="text-xs text-white/60">
                        各メンバーから受け取り予定
                      </span>
                      <p className="text-sm font-bold text-white tabular-nums">
                        残 ¥{group.remainingAmount.toLocaleString()}
                      </p>
                    </div>
                    <div className="divide-y divide-white/5">
                      {group.rows.map((row) => (
                        <div
                          key={`rx-${row.fixedExpenseId}-${row.payer}`}
                          className={`flex items-center gap-2 px-3 py-2 ${
                            row.isPaid ? "opacity-60" : ""
                          }`}
                        >
                          <span className="text-base">{row.categoryIcon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{row.label}</p>
                            <p className="text-[10px] text-white/40 truncate">
                              {row.payer}
                              {row.sourceBankAccount ? ` (${row.sourceBankAccount.account_name})` : ""}
                              {" から · 毎月"}{row.paymentDay}日
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-white tabular-nums">
                            ¥{row.payerAmount.toLocaleString()}
                          </p>
                          {row.isPaid && (
                            <span className="ml-1 h-5 w-5 rounded-md flex items-center justify-center bg-green-500/20 text-green-300">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}

        <div className="flex justify-end mt-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-white/70 hover:text-white"
          >
            閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
