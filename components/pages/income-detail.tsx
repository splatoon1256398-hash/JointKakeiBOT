"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, TrendingUp, Banknote, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface IncomeTransaction {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name: string;
  amount: number;
  memo: string;
  metadata?: { gross_amount?: number } | null;
}

interface MonthlyIncomeData {
  month: string;
  手取り: number;
  控除額: number;
  fullMonth: string;
}

interface Props {
  onBack: () => void;
  selectedYear: number;
  selectedMonth: number;
}

export function IncomeDetail({ onBack, selectedYear, selectedMonth }: Props) {
  const { selectedUser, theme } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [yearlyData, setYearlyData] = useState<MonthlyIncomeData[]>([]);
  const [monthTransactions, setMonthTransactions] = useState<IncomeTransaction[]>([]);
  const [monthNetIncome, setMonthNetIncome] = useState(0);
  const [monthGrossIncome, setMonthGrossIncome] = useState(0);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 過去12ヶ月分の収入データ
      const prevYear = selectedYear - 1;
      const mm = String(selectedMonth).padStart(2, "0");
      const startStr = `${prevYear}-${mm}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0);
      const endStr = `${selectedYear}-${mm}-${String(lastDay.getDate()).padStart(2, "0")}`;

      let query = supabase
        .from("transactions")
        .select("*")
        .eq("type", "income")
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true });

      // 共同の場合は全員の収入、個人の場合はその人の収入
      if (selectedUser !== "共同") {
        query = query.eq("user_type", selectedUser);
      }

      const { data } = await query;
      const txs = data || [];

      // 年間推移 - target_month優先
      const monthlyMap: Record<string, { net: number; gross: number }> = {};
      txs.forEach((t) => {
        const m = t.target_month ? t.target_month.substring(0, 7) : t.date.substring(0, 7);
        if (!monthlyMap[m]) monthlyMap[m] = { net: 0, gross: 0 };
        monthlyMap[m].net += t.amount;
        const gross = t.metadata?.gross_amount || t.amount;
        monthlyMap[m].gross += gross;
      });

      const yearly = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({
          month: month.substring(5) + "月",
          手取り: d.net,
          控除額: d.gross - d.net,
          fullMonth: month,
        }));
      setYearlyData(yearly);

      // 選択月のデータ - target_month優先
      const selectedMonthStr = `${selectedYear}-${mm}`;
      const monthTxs = txs.filter((t) => {
        const effectiveMonth = t.target_month ? t.target_month.substring(0, 7) : t.date.substring(0, 7);
        return effectiveMonth === selectedMonthStr;
      });
      setMonthTransactions(monthTxs);

      const net = monthTxs.reduce((s, t) => s + t.amount, 0);
      const gross = monthTxs.reduce((s, t) => s + (t.metadata?.gross_amount || t.amount), 0);
      setMonthNetIncome(net);
      setMonthGrossIncome(gross);
    } catch (err) {
      console.error("収入データ取得エラー:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUser, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deductions = monthGrossIncome - monthNetIncome;
  const deductionRate = monthGrossIncome > 0 ? Math.round((deductions / monthGrossIncome) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* 戻るボタン */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="text-sm">分析に戻る</span>
      </button>

      {/* 今月の収入サマリー */}
      <div className="card-solid p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Banknote className="h-4 w-4 text-green-400" />
          {selectedMonth}月の収入
        </h3>

        {isLoading ? (
          <div className="h-24 bg-white/10 rounded-xl animate-pulse" />
        ) : (
          <div className="space-y-3">
            {/* 手取り vs 総支給 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <p className="text-[10px] text-green-400/70 mb-1">手取り（差引支給額）</p>
                <p className="text-xl font-bold text-green-400">
                  ¥{monthNetIncome.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[10px] text-white/50 mb-1">総支給額（額面）</p>
                <p className="text-xl font-bold text-white">
                  ¥{monthGrossIncome.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 控除バー */}
            {deductions > 0 && (
              <div className="p-3 rounded-xl card-solid-inner">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/60">控除額（税・保険料等）</span>
                  <span className="text-sm font-bold text-orange-400">
                    -¥{deductions.toLocaleString()} ({deductionRate}%)
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div
                      className="h-full bg-green-500 rounded-l-full"
                      style={{ width: `${100 - deductionRate}%` }}
                    />
                    <div
                      className="h-full bg-orange-500 rounded-r-full"
                      style={{ width: `${deductionRate}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-green-400/60">手取り {100 - deductionRate}%</span>
                  <span className="text-[10px] text-orange-400/60">控除 {deductionRate}%</span>
                </div>
              </div>
            )}

            {/* 収入明細 */}
            {monthTransactions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-white/40 mt-2">明細</p>
                {monthTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-3 rounded-xl card-solid-inner"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-500/10 text-lg">
                      {t.category_sub === "給与" ? "💰" : t.category_sub === "賞与" ? "🎉" : "💵"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">
                        {t.memo || t.store_name || t.category_sub}
                      </p>
                      <p className="text-xs text-white/40 truncate">
                        {t.store_name && t.memo ? t.store_name + " · " : ""}{t.category_main} / {t.category_sub}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-green-400">
                        +¥{t.amount.toLocaleString()}
                      </p>
                      {t.metadata?.gross_amount && t.metadata.gross_amount !== t.amount && (
                        <p className="text-[10px] text-white/30">
                          額面 ¥{t.metadata.gross_amount.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 年間収入推移（積み上げ棒グラフ） */}
      {!isLoading && yearlyData.length > 0 && (
        <div className="card-solid p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            年間収入推移
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" style={{ fontSize: "11px" }} />
              <YAxis stroke="rgba(255,255,255,0.4)" style={{ fontSize: "11px" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px" }}
                labelStyle={{ color: "#fff" }}
                formatter={(value: number, name: string) => [`¥${value.toLocaleString()}`, name]}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(value) => <span style={{ color: "rgba(255,255,255,0.7)" }}>{value}</span>}
              />
              <Bar dataKey="手取り" stackId="income" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="控除額" stackId="income" fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-white/30 text-center mt-1">※ 控除額のデータがある月のみ積み上げ表示</p>
        </div>
      )}
    </div>
  );
}
