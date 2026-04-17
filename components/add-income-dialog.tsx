"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  Loader2,
  Sparkles,
  CalendarCheck,
  Briefcase,
} from "lucide-react";
import { getJSTDateString } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";
import { useScanUpload } from "@/lib/hooks/use-scan-upload";
import { ScanningOverlay } from "@/components/scan/scanning-overlay";
import { ScanButtons } from "@/components/scan/scan-buttons";
import { CapturedPreview } from "@/components/scan/captured-preview";
import {
  CategoryPicker,
  type PickerCategory,
} from "@/components/scan/category-picker";

interface AddIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: string;
}

/**
 * Income-specific category list. Unlike expenses these are hard-coded
 * because the categories are a short, fixed set (given by Japanese
 * payroll conventions) and don't need DB persistence.
 */
const INCOME_CATEGORIES: PickerCategory[] = [
  { main: "給与・賞与", icon: "💰", subs: ["給与", "賞与", "手当"] },
  { main: "副業", icon: "💼", subs: ["フリーランス", "アルバイト", "その他"] },
  { main: "投資", icon: "📈", subs: ["株式", "配当", "利息", "不動産"] },
  { main: "その他", icon: "💵", subs: ["その他"] },
];

interface IncomeAnalysisResult {
  date?: string;
  net_amount?: number;
  gross_amount?: number;
  source?: string;
  memo?: string;
  category_main?: string;
  category_sub?: string;
  _perf?: import("@/lib/gemini").PerfRecord;
}

/** Returns `YYYY-MM` for `date` (defaults to today when unset). */
function monthOf(date: string | undefined): string {
  const d = date ? new Date(date) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(base: string, delta: number): string {
  const d = new Date(base + "-01");
  const shifted = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

function categoryIcon(main: string): string {
  return INCOME_CATEGORIES.find((c) => c.main === main)?.icon ?? "💵";
}

export function AddIncomeDialog({
  open,
  onOpenChange,
  selectedUser,
}: AddIncomeDialogProps) {
  const { triggerRefresh } = useApp();
  const { assets: charAssets, isActive: charActive } = useCharacter();

  const [isSaving, setIsSaving] = useState(false);
  const [date, setDate] = useState(getJSTDateString);
  const [categoryMain, setCategoryMain] = useState("給与・賞与");
  const [categorySub, setCategorySub] = useState("給与");
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [grossAmount, setGrossAmount] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [incomeMonth, setIncomeMonth] = useState<string>(() => monthOf(undefined));
  const [targetMonth, setTargetMonth] = useState<string>(() =>
    shiftMonth(monthOf(undefined), 1),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleScanResult = useCallback((result: IncomeAnalysisResult) => {
    if (result.date) setDate(result.date);
    if (result.net_amount) setAmount(String(result.net_amount));
    if (result.gross_amount) setGrossAmount(String(result.gross_amount));
    if (result.source) setSource(result.source);
    if (result.memo) setMemo(result.memo);
    if (result.category_main) setCategoryMain(result.category_main);
    if (result.category_sub) setCategorySub(result.category_sub);
  }, []);

  const scan = useScanUpload<IncomeAnalysisResult>({
    endpoint: "/api/income-scan",
    perfLabel: "income-scan",
    label: "給与明細",
    onSuccess: handleScanResult,
  });

  const resetForm = useCallback(() => {
    const today = getJSTDateString();
    setDate(today);
    setCategoryMain("給与・賞与");
    setCategorySub("給与");
    setSource("");
    setAmount("");
    setGrossAmount("");
    setMemo("");
    setIncomeMonth(monthOf(undefined));
    setTargetMonth(shiftMonth(monthOf(undefined), 1));
    scan.clearCaptured();
  }, [scan]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handlePickerSelect = (main: string, sub: string) => {
    setCategoryMain(main);
    setCategorySub(sub);
    setPickerOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("transactions").insert({
        user_id: user?.id,
        user_type: selectedUser,
        type: "income",
        date,
        category_main: categoryMain,
        category_sub: categorySub,
        store_name: source,
        amount: Number(amount),
        memo,
        metadata: grossAmount ? { gross_amount: Number(grossAmount) } : null,
        target_month: targetMonth ? `${targetMonth}-01` : null,
        income_month: incomeMonth ? `${incomeMonth}-01` : null,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Supabase保存エラー:", error);
        alert(`保存に失敗しました: ${error.message}`);
        return;
      }

      alert("収入を記録しました！");
      triggerRefresh();
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error("保存エラー:", error);
      alert("保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  // The three month options are always [prev, current, next] relative to
  // the selected receipt date, rendered as pill buttons. Memoized per
  // render to keep the derivation readable.
  const renderMonthOptions = (
    current: string,
    onPick: (value: string) => void,
    accentClass: string,
    labelSuffix: (d: Date) => string,
  ) => {
    const anchor = date ? new Date(date) : new Date();
    const mk = (delta: number) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
      return {
        label: labelSuffix(d),
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      };
    };
    const options = [mk(-1), mk(0), mk(1)];
    return options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onPick(opt.value)}
        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
          current === opt.value
            ? accentClass
            : "bg-slate-800/50 text-white/50 border-slate-700 hover:bg-slate-700/50 hover:text-white/70"
        }`}
      >
        {opt.label}
      </button>
    ));
  };

  const deduction =
    grossAmount && amount && Number(grossAmount) > 0
      ? {
          value: Number(grossAmount) - Number(amount),
          pct: (1 - Number(amount) / Number(grossAmount)) * 100,
        }
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden bg-slate-900/95 backdrop-blur-xl border-slate-700"
        style={{ overscrollBehavior: "contain" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            {charActive && charAssets ? (
              <CharacterImage
                src={charAssets.avatar}
                alt=""
                width={20}
                height={20}
                className="object-contain"
                fallback={<TrendingUp className="h-4 w-4 text-green-400" />}
              />
            ) : (
              <TrendingUp className="h-4 w-4 text-green-400" />
            )}
            収入を記録 - {selectedUser}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            給与明細を撮影・アップロードして自動入力できます
          </DialogDescription>
        </DialogHeader>

        <ScanningOverlay
          open={scan.isAnalyzing}
          title="給与明細をAI解析中..."
          subtitle="総支給額・差引支給額を読み取っています"
          tone="green"
        />

        <CategoryPicker
          open={pickerOpen}
          categories={INCOME_CATEGORIES}
          currentMain={categoryMain}
          currentSub={categorySub}
          onSelect={handlePickerSelect}
          onClose={() => setPickerOpen(false)}
          tone="green"
          mainTitle="収入カテゴリーを選択"
          mainColumns={2}
        />

        {!scan.capturedImage && !scan.isAnalyzing && (
          <ScanButtons
            cameraInputRef={scan.cameraInputRef}
            fileInputRef={scan.fileInputRef}
            onCameraChange={scan.onCameraChange}
            onFileChange={scan.onFileChange}
            variant="income"
          />
        )}

        {scan.capturedImage && !scan.isAnalyzing && (
          <CapturedPreview
            src={scan.capturedImage}
            isPdf={scan.isPdf}
            onClear={scan.clearCaptured}
            variant="income"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border">
            <Label htmlFor="date" className="text-sm font-semibold">
              日付
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="max-w-xs h-8 text-sm bg-white dark:bg-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-blue-400" />
              何月度の収入？（統計用）
            </Label>
            <div className="flex gap-1.5">
              {renderMonthOptions(
                incomeMonth,
                setIncomeMonth,
                "bg-blue-600 text-white border-blue-500 shadow-md",
                (d) => `${d.getMonth() + 1}月度`,
              )}
            </div>
            <p className="text-[10px] text-white/30">
              年収サマリー・月別推移の統計に使用されます
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-emerald-400" />
              何月分の予算に充てる？
            </Label>
            <div className="flex gap-1.5">
              {renderMonthOptions(
                targetMonth,
                setTargetMonth,
                "bg-emerald-600 text-white border-emerald-500 shadow-md",
                (d) => {
                  const anchor = date ? new Date(date) : new Date();
                  const delta =
                    (d.getFullYear() - anchor.getFullYear()) * 12 +
                    (d.getMonth() - anchor.getMonth());
                  const suffix =
                    delta === 0 ? "（当月）" : delta === 1 ? "（翌月）" : "";
                  return `${d.getMonth() + 1}月${suffix}`;
                },
              )}
            </div>
            <p className="text-[10px] text-white/30">
              ダッシュボード・分析画面での予算計算に反映されます
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-white">カテゴリー</Label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 transition-all text-left"
            >
              <span className="flex items-center gap-2 text-sm">
                <span>{categoryIcon(categoryMain)}</span>
                <span className="font-semibold text-white">{categoryMain}</span>
                <span className="text-white/30">/</span>
                <span className="text-white/60">{categorySub}</span>
              </span>
              <span className="text-[10px] text-green-400 shrink-0">変更 ›</span>
            </button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-white">収入源</Label>
            <Input
              placeholder="例：会社名、クライアント名"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-white">
              手取り金額（差引支給額） *
            </Label>
            <Input
              type="number"
              placeholder="250000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="h-10 text-lg bg-slate-800/50 border-slate-700 text-white font-bold"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-white">総支給額（額面）</Label>
            <Input
              type="number"
              placeholder="320000"
              value={grossAmount}
              onChange={(e) => setGrossAmount(e.target.value)}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
            />
            {deduction && (
              <p className="text-xs text-orange-400">
                控除額: ¥{deduction.value.toLocaleString()}（
                {deduction.pct.toFixed(1)}%）
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-white">メモ</Label>
            <Input
              placeholder="詳細を入力"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
            />
          </div>

          {amount && (
            <div className="p-2 rounded-lg bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-700/50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">手取り</span>
                <span className="text-2xl font-bold text-green-400">
                  +¥{Number(amount).toLocaleString()}
                </span>
              </div>
              {grossAmount && Number(grossAmount) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">総支給額</span>
                  <span className="text-sm text-gray-300">
                    ¥{Number(grossAmount).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1 h-10 text-sm font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  保存中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  収入を記録
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="h-10 text-sm"
              disabled={isSaving}
            >
              キャンセル
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
