"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  FileText,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface IncomeTransaction {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name: string;
  amount: number;
  memo: string;
  metadata?: { gross_amount?: number } | null;
  income_month?: string | null;
  target_month?: string | null;
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
  const { selectedUser } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"top" | "annual">("top");

  // ===== target_month ベースのデータ（今月の予算充当収入） =====
  const [targetMonthTxs, setTargetMonthTxs] = useState<IncomeTransaction[]>([]);
  const [tmNetIncome, setTmNetIncome] = useState(0);
  const [tmGrossIncome, setTmGrossIncome] = useState(0);

  // ===== income_month ベースのデータ（年間統計） =====
  const [yearlyData, setYearlyData] = useState<MonthlyIncomeData[]>([]);
  const [yearNetTotal, setYearNetTotal] = useState(0);
  const [yearGrossTotal, setYearGrossTotal] = useState(0);
  const [yearMonthCount, setYearMonthCount] = useState(0);
  const [allYearTxs, setAllYearTxs] = useState<IncomeTransaction[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 幅広く取得（前年〜当年）
      const startStr = `${selectedYear - 1}-01-01`;
      const endStr = `${selectedYear}-12-31`;

      let query = supabase
        .from("transactions")
        .select("*")
        .eq("type", "income")
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true });

      query = query.eq("user_type", selectedUser);

      const { data } = await query;
      const txs = (data || []) as IncomeTransaction[];

      // ===== 1) target_month ベース: 選択月に充てた収入 =====
      const mm = String(selectedMonth).padStart(2, "0");
      const targetMonthStr = `${selectedYear}-${mm}`;
      const tmTxs = txs.filter((t) => {
        const tm = t.target_month ? t.target_month.substring(0, 7) : null;
        return tm === targetMonthStr;
      });
      setTargetMonthTxs(tmTxs);
      setTmNetIncome(tmTxs.reduce((s, t) => s + t.amount, 0));
      setTmGrossIncome(
        tmTxs.reduce((s, t) => s + (t.metadata?.gross_amount || t.amount), 0)
      );

      // ===== 2) income_month ベース: 年間統計 =====
      const monthlyMap: Record<string, { net: number; gross: number }> = {};
      txs.forEach((t) => {
        const m = t.income_month
          ? t.income_month.substring(0, 7)
          : t.date.substring(0, 7);
        if (!m.startsWith(String(selectedYear))) return;
        if (!monthlyMap[m]) monthlyMap[m] = { net: 0, gross: 0 };
        monthlyMap[m].net += t.amount;
        monthlyMap[m].gross += t.metadata?.gross_amount || t.amount;
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

      let yNet = 0,
        yGross = 0,
        mCount = 0;
      Object.values(monthlyMap).forEach((d) => {
        yNet += d.net;
        yGross += d.gross;
        if (d.net > 0) mCount++;
      });
      setYearNetTotal(yNet);
      setYearGrossTotal(yGross);
      setYearMonthCount(mCount);

      // 年間の全トランザクション（income_monthベースでソート表示用）
      const yearTxs = txs.filter((t) => {
        const m = t.income_month
          ? t.income_month.substring(0, 7)
          : t.date.substring(0, 7);
        return m.startsWith(String(selectedYear));
      });
      setAllYearTxs(yearTxs);
    } catch (err) {
      console.error("収入データ取得エラー:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUser, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ===== 派生値 =====
  const tmDeductions = tmGrossIncome - tmNetIncome;
  const tmDeductionRate =
    tmGrossIncome > 0 ? Math.round((tmDeductions / tmGrossIncome) * 100) : 0;
  const yearDeductions = yearGrossTotal - yearNetTotal;
  const yearDeductionRate =
    yearGrossTotal > 0
      ? Math.round((yearDeductions / yearGrossTotal) * 100)
      : 0;

  // target_monthから income_monthを推定して表示
  const getIncomeMonthLabel = () => {
    if (targetMonthTxs.length > 0) {
      const first = targetMonthTxs[0];
      const im = first.income_month
        ? first.income_month.substring(0, 7)
        : first.date.substring(0, 7);
      const imMonth = parseInt(im.substring(5));
      return `${imMonth}月度明細`;
    }
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    return `${prevMonth}月度明細`;
  };

  // ===== 年間レポートページ =====
  if (view === "annual") {
    // 月別にグルーピング（income_monthベース）
    const monthGrouped: Record<string, IncomeTransaction[]> = {};
    allYearTxs.forEach((t) => {
      const m = t.income_month
        ? t.income_month.substring(0, 7)
        : t.date.substring(0, 7);
      if (!monthGrouped[m]) monthGrouped[m] = [];
      monthGrouped[m].push(t);
    });
    const sortedMonths = Object.keys(monthGrouped).sort();

    return (
      <div className="space-y-3">
        {/* ヘッダー */}
        <button
          onClick={() => setView("top")}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 border border-white/20 bg-white/10 text-white/90 hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="text-sm">収入分析に戻る</span>
        </button>

        <h2 className="text-lg font-bold text-white">
          {selectedYear}年 収入分析・年間レポート
        </h2>

        {/* 年間サマリー詳細 */}
        <div className="card-solid p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-green-400" />
            {selectedYear}年 年間収入サマリー
          </h3>

          <div className="space-y-3">
            {/* 手取り */}
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                <p className="text-[10px] text-green-400/70">年間手取り（振込額）</p>
              </div>
              <p className="text-2xl font-bold text-green-400">
                ¥{yearNetTotal.toLocaleString()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* 総支給 */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-white/50" />
                  <p className="text-[10px] text-white/50">年間総支給額</p>
                </div>
                <p className="text-lg font-bold text-white">
                  ¥{yearGrossTotal.toLocaleString()}
                </p>
              </div>
              {/* 控除 */}
              <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowDownRight className="h-3.5 w-3.5 text-orange-400" />
                  <p className="text-[10px] text-orange-400/70">年間控除合計</p>
                </div>
                <p className="text-lg font-bold text-orange-400">
                  -¥{yearDeductions.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 控除割合バー */}
            {yearDeductions > 0 && (
              <div className="p-3 rounded-xl card-solid-inner">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/60">年間控除率</span>
                  <span className="text-sm font-bold text-orange-400">
                    {yearDeductionRate}%
                  </span>
                </div>
                <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div
                      className="h-full bg-green-500 rounded-l-full"
                      style={{ width: `${100 - yearDeductionRate}%` }}
                    />
                    <div
                      className="h-full bg-orange-500 rounded-r-full"
                      style={{ width: `${yearDeductionRate}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-green-400/60">
                    手取り {100 - yearDeductionRate}%
                  </span>
                  <span className="text-[10px] text-orange-400/60">
                    控除 {yearDeductionRate}%
                  </span>
                </div>
              </div>
            )}

            {yearMonthCount > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl card-solid-inner">
                  <p className="text-[10px] text-white/40 mb-1">データ月数</p>
                  <p className="text-lg font-bold text-white">
                    {yearMonthCount}
                    <span className="text-xs text-white/40 ml-1">ヶ月</span>
                  </p>
                </div>
                <div className="p-3 rounded-xl card-solid-inner">
                  <p className="text-[10px] text-white/40 mb-1">月平均手取り</p>
                  <p className="text-lg font-bold text-white">
                    ¥{Math.round(yearNetTotal / yearMonthCount).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 年間推移チャート */}
        {yearlyData.length > 0 && (
          <div className="card-solid p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              {selectedYear}年 月別収入推移
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={yearlyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.1)"
                />
                <XAxis
                  dataKey="month"
                  stroke="rgba(255,255,255,0.4)"
                  style={{ fontSize: "11px" }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.4)"
                  style={{ fontSize: "11px" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "none",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(value: number, name: string) => [
                    `¥${value.toLocaleString()}`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                  formatter={(value) => (
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>
                      {value}
                    </span>
                  )}
                />
                <Bar
                  dataKey="手取り"
                  stackId="income"
                  fill="#22c55e"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="控除額"
                  stackId="income"
                  fill="#f97316"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-white/30 text-center mt-1">
              ※ 支給月（income_month）ベースで集計
            </p>
          </div>
        )}

        {/* 月別収入カード一覧（income_monthベース） */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Calendar className="h-4 w-4 text-green-400" />
            {selectedYear}年 月別収入明細
          </h3>

          {sortedMonths.length === 0 && (
            <div className="card-solid p-6 text-center">
              <p className="text-sm text-white/40">
                {selectedYear}年の収入データはありません
              </p>
            </div>
          )}

          {sortedMonths.map((monthKey) => {
            const txs = monthGrouped[monthKey];
            const mNet = txs.reduce((s, t) => s + t.amount, 0);
            const mGross = txs.reduce(
              (s, t) => s + (t.metadata?.gross_amount || t.amount),
              0
            );
            const mDeductions = mGross - mNet;
            const mRate =
              mGross > 0 ? Math.round((mDeductions / mGross) * 100) : 0;
            const monthNum = parseInt(monthKey.substring(5));

            return (
              <div key={monthKey} className="card-solid p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-500/10 text-sm">
                      💰
                    </div>
                    {monthNum}月度の収入
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                    {txs.length}件
                  </span>
                </div>

                {/* 手取り / 総支給 / 控除 */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-[9px] text-green-400/60">手取り</p>
                    <p className="text-sm font-bold text-green-400">
                      ¥{mNet.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-[9px] text-white/40">総支給</p>
                    <p className="text-sm font-bold text-white">
                      ¥{mGross.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <p className="text-[9px] text-orange-400/60">控除</p>
                    <p className="text-sm font-bold text-orange-400">
                      {mRate}%
                    </p>
                  </div>
                </div>

                {/* 控除バー */}
                {mDeductions > 0 && (
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                    <div className="h-full flex">
                      <div
                        className="h-full bg-green-500 rounded-l-full"
                        style={{ width: `${100 - mRate}%` }}
                      />
                      <div
                        className="h-full bg-orange-500 rounded-r-full"
                        style={{ width: `${mRate}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 明細 */}
                <div className="space-y-1.5">
                  {txs.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl card-solid-inner"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-500/10 text-base">
                        {t.category_sub === "給与"
                          ? "💰"
                          : t.category_sub === "賞与"
                            ? "🎉"
                            : "💵"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm truncate">
                          {t.memo || t.store_name || t.category_sub}
                        </p>
                        <p className="text-[10px] text-white/40 truncate">
                          {t.date} · {t.category_sub}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-green-400">
                          +¥{t.amount.toLocaleString()}
                        </p>
                        {t.metadata?.gross_amount &&
                          t.metadata.gross_amount !== t.amount && (
                            <p className="text-[10px] text-white/30">
                              額面 ¥{t.metadata.gross_amount.toLocaleString()}
                            </p>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===== トップ画面（月別分析） =====
  return (
    <div className="space-y-3">
      {/* 戻るボタン */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 border border-white/20 bg-white/10 text-white/90 hover:bg-white/20 transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="text-sm">分析に戻る</span>
      </button>

      <h2 className="text-lg font-bold text-white">
        {selectedYear}年{selectedMonth}月の収入分析
      </h2>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-white/10 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ===== Card 1: 今月の予算充当収入 (target_month ベース) ===== */}
          <div className="card-solid p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-green-400" />
              {selectedMonth}月の収入（{getIncomeMonthLabel()}）
            </h3>

            {targetMonthTxs.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-white/40">
                  {selectedMonth}月に充当された収入はありません
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 手取り（メイン） + 総支給 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <p className="text-[10px] text-green-400/70 mb-1">
                      手取り（差引支給額）
                    </p>
                    <p className="text-xl font-bold text-green-400">
                      ¥{tmNetIncome.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[10px] text-white/50 mb-1">
                      総支給額（額面）
                    </p>
                    <p className="text-xl font-bold text-white">
                      ¥{tmGrossIncome.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* 控除バー */}
                {tmDeductions > 0 && (
                  <div className="p-3 rounded-xl card-solid-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/60">
                        控除額（税・保険料等）
                      </span>
                      <span className="text-sm font-bold text-orange-400">
                        -¥{tmDeductions.toLocaleString()} ({tmDeductionRate}%)
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <div
                          className="h-full bg-green-500 rounded-l-full"
                          style={{ width: `${100 - tmDeductionRate}%` }}
                        />
                        <div
                          className="h-full bg-orange-500 rounded-r-full"
                          style={{ width: `${tmDeductionRate}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-green-400/60">
                        手取り {100 - tmDeductionRate}%
                      </span>
                      <span className="text-[10px] text-orange-400/60">
                        控除 {tmDeductionRate}%
                      </span>
                    </div>
                  </div>
                )}

                {/* 収入明細 */}
                <div className="space-y-1.5">
                  <p className="text-xs text-white/40 mt-1">明細</p>
                  {targetMonthTxs.map((t) => {
                    const im = t.income_month
                      ? t.income_month.substring(0, 7)
                      : t.date.substring(0, 7);
                    const imMonth = parseInt(im.substring(5));
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 p-3 rounded-xl card-solid-inner"
                      >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-500/10 text-lg">
                          {t.category_sub === "給与"
                            ? "💰"
                            : t.category_sub === "賞与"
                              ? "🎉"
                              : "💵"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-sm truncate">
                            {t.memo || t.store_name || t.category_sub}
                          </p>
                          <p className="text-[10px] text-white/40 truncate">
                            {imMonth}月度 · {t.category_sub}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-base font-bold text-green-400">
                            +¥{t.amount.toLocaleString()}
                          </p>
                          {t.metadata?.gross_amount &&
                            t.metadata.gross_amount !== t.amount && (
                              <p className="text-[10px] text-white/30">
                                額面 ¥
                                {t.metadata.gross_amount.toLocaleString()}
                              </p>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ===== Card 2: 年間収入サマリー (income_month ベース) ===== */}
          <div className="card-solid p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-400" />
                {selectedYear}年 年間収入サマリー
              </h3>
              <button
                onClick={() => setView("annual")}
                className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
              >
                詳細
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {yearMonthCount === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-white/40">年間データなし</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 年間手取り */}
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                    <p className="text-[10px] text-green-400/70">
                      年間手取り（{yearMonthCount}ヶ月）
                    </p>
                  </div>
                  <p className="text-2xl font-bold text-green-400">
                    ¥{yearNetTotal.toLocaleString()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <ArrowUpRight className="h-3.5 w-3.5 text-white/50" />
                      <p className="text-[10px] text-white/50">年間総支給額</p>
                    </div>
                    <p className="text-lg font-bold text-white">
                      ¥{yearGrossTotal.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <ArrowDownRight className="h-3.5 w-3.5 text-orange-400" />
                      <p className="text-[10px] text-orange-400/70">年間控除合計</p>
                    </div>
                    <p className="text-lg font-bold text-orange-400">
                      -¥{yearDeductions.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* 控除割合バー */}
                {yearDeductions > 0 && (
                  <div className="p-3 rounded-xl card-solid-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/60">控除率</span>
                      <span className="text-sm font-bold text-orange-400">
                        {yearDeductionRate}%
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <div
                          className="h-full bg-green-500 rounded-l-full"
                          style={{ width: `${100 - yearDeductionRate}%` }}
                        />
                        <div
                          className="h-full bg-orange-500 rounded-r-full"
                          style={{ width: `${yearDeductionRate}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-green-400/60">
                        手取り {100 - yearDeductionRate}%
                      </span>
                      <span className="text-[10px] text-orange-400/60">
                        控除 {yearDeductionRate}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
