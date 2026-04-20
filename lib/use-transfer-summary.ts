"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import {
  computeTransferSummary,
  formatTargetMonth,
  getMonthBounds,
  isOwnerUserType,
  type FixedExpenseRow,
  type FixedExpenseTransferRow,
  type TransferSummary,
} from "@/lib/transfers";

export function getCurrentTargetMonth(): string {
  return formatTargetMonth(new Date());
}

export function useTransferSummary(targetMonth: string) {
  const { user, selectedUser, bankAccounts, categoryIcons, refreshTrigger } = useApp();
  const [summary, setSummary] = useState<TransferSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { start, end } = getMonthBounds(targetMonth);

      // 期間が重なる全ての active な固定費を取得
      // start_date が月末より後、または end_date が月初より前 → 除外
      const expensesQuery = supabase
        .from("fixed_expenses")
        .select("*")
        .eq("is_active", true)
        .or(`start_date.is.null,start_date.lte.${end}`)
        .or(`end_date.is.null,end_date.gte.${start}`);

      const transfersQuery = supabase
        .from("fixed_expense_transfers")
        .select("*")
        .eq("target_month", targetMonth);

      const [expensesRes, transfersRes] = await Promise.all([expensesQuery, transfersQuery]);

      if (expensesRes.error) throw expensesRes.error;
      if (transfersRes.error) throw transfersRes.error;

      const currentUser = isOwnerUserType(selectedUser) ? selectedUser : "共同";
      setSummary(
        computeTransferSummary({
          currentUser,
          fixedExpenses: (expensesRes.data ?? []) as FixedExpenseRow[],
          bankAccounts,
          transfers: (transfersRes.data ?? []) as FixedExpenseTransferRow[],
          targetMonth,
          categoryIcons,
        }),
      );
    } catch (e) {
      console.error("振込サマリー取得エラー:", e);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user, selectedUser, bankAccounts, categoryIcons, targetMonth]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, refreshTrigger]);

  return { summary, loading, refetch: fetchAll };
}
