"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, ChevronRight, X, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

/**
 * Feature #7: 月次 AI レポートのチャット先頭ピン留めバナー。
 *
 * - ユーザの未読レポート (`read_at IS NULL`) があれば、チャット画面上部に表示
 * - 要約テキストを折りたたみ表示 (デフォルトは閉じる)
 * - 「詳細を見る」→ 分析タブへ該当月をプリセットして遷移
 * - × ボタンで `read_at` を付けて次から非表示に
 *
 * データ元: `monthly_reports` テーブル (Stage 6 で追加)
 */

interface Report {
  id: string;
  year: number;
  month: number;
  summary_text: string;
  total_expense: number;
  total_income: number;
  read_at: string | null;
}

export function MonthlyReportBanner() {
  const { user, theme, setKakeiboTab } = useApp();
  const [report, setReport] = useState<Report | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadLatest = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("monthly_reports")
      .select("id, year, month, summary_text, total_expense, total_income, read_at")
      .eq("user_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[monthly-report-banner] fetch failed:", error.message);
      return;
    }
    setReport(data);
  }, [user]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const dismiss = useCallback(async () => {
    if (!report || !user) return;
    const current = report;
    setReport(null); // optimistic
    const { error } = await supabase
      .from("monthly_reports")
      .update({ read_at: new Date().toISOString() })
      .eq("id", current.id);
    if (error) {
      console.warn("[monthly-report-banner] mark-read failed:", error.message);
      setReport(current); // rollback
    }
  }, [report, user]);

  const goToDetails = useCallback(() => {
    if (!report) return;
    // ページ遷移: ?page=kakeibo&tab=analysis に加え year/month をクエリで渡す。
    // Analysis 側は現状 URL パラメータを読んでいないので、まずタブ切替のみ実行。
    // 将来的に month preset を読ませる時のためにクエリも付けておく。
    const params = new URLSearchParams(window.location.search);
    params.set("page", "kakeibo");
    params.set("tab", "analysis");
    params.set("year", String(report.year));
    params.set("month", String(report.month));
    window.history.pushState({}, "", `?${params.toString()}`);
    setKakeiboTab("analysis");
    // 既読フラグを付けつつ閉じる
    dismiss();
  }, [report, setKakeiboTab, dismiss]);

  if (!report) return null;

  return (
    <div
      className="mb-3 overflow-hidden rounded-xl border backdrop-blur-md"
      style={{
        borderColor: `${theme.primary}80`,
        background: `linear-gradient(135deg, ${theme.primary}20, ${theme.secondary}10)`,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {report.year}年{report.month}月の家計レポート
            </p>
            <p className="truncate text-xs text-white/60">
              支出 ¥{report.total_expense.toLocaleString()} / 収入 ¥{report.total_income.toLocaleString()}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-white/60 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/90">
            {report.summary_text}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={goToDetails}
              className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
              }}
            >
              詳細を見る
              <ChevronRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70 transition-colors hover:bg-white/20"
            >
              <X className="h-3 w-3" />
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
