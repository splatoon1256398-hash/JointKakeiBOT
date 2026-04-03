"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import { getJSTDateString } from "@/lib/date";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Loader2, Sparkles, Camera, Upload, X, FileText, CalendarCheck, Briefcase } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface AddIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: string;
}

// 収入カテゴリー
const INCOME_CATEGORIES = [
  { main: "給与・賞与", icon: "💰", sub: ["給与", "賞与", "手当"] },
  { main: "副業", icon: "💼", sub: ["フリーランス", "アルバイト", "その他"] },
  { main: "投資", icon: "📈", sub: ["株式", "配当", "利息", "不動産"] },
  { main: "その他", icon: "💵", sub: ["その他"] },
];

export function AddIncomeDialog({ open, onOpenChange, selectedUser }: AddIncomeDialogProps) {
  const { triggerRefresh } = useApp();
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [date, setDate] = useState(getJSTDateString());
  const [categoryMain, setCategoryMain] = useState("給与・賞与");
  const [categorySub, setCategorySub] = useState("給与");
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [grossAmount, setGrossAmount] = useState<string>("");
  const [memo, setMemo] = useState("");
  // 統計用: 何月度の収入か（デフォルト: 当月）
  const [incomeMonth, setIncomeMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  // 予算用: どの月の予算に充てるか（デフォルト: 翌月）
  const [targetMonth, setTargetMonth] = useState<string>(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  });

  // カテゴリーピッカー状態
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<'main' | 'sub'>('main');
  const [pickerTempMain, setPickerTempMain] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ファイル拡張子からMIMEタイプを推定
  const detectMimeType = (file: File): string => {
    if (file.type && file.type !== 'application/octet-stream') return file.type;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
      pdf: 'application/pdf',
    };
    return mimeMap[ext || ''] || 'image/jpeg';
  };

  // Supabase Storageに画像をアップロード
  const uploadToStorage = async (file: File): Promise<{ path: string; mimeType: string }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('認証が必要です');

    const userId = session.user.id;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}/${Date.now()}.${ext}`;
    const contentType = detectMimeType(file);

    const { error } = await supabase.storage
      .from('receipt-images')
      .upload(fileName, file, { cacheControl: '300', upsert: false, contentType });

    if (error) throw new Error(`アップロード失敗: ${error.message}`);
    return { path: fileName, mimeType: contentType };
  };

  // ネイティブカメラを起動
  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  // カメラ撮影結果の処理
  const handleCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setCapturedImage(URL.createObjectURL(file));
    setIsPdf(false);

    try {
      const { path, mimeType } = await uploadToStorage(file);
      await analyzeIncome(path, mimeType);
    } catch (err) {
      console.error('カメラ処理エラー:', err);
      alert('画像の処理に失敗しました。');
      setIsAnalyzing(false);
    }
  };

  // ファイルから画像/PDFを読み込み
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const isFilePdf = file.type === 'application/pdf';
    setCapturedImage(URL.createObjectURL(file));
    setIsPdf(isFilePdf);

    try {
      const { path, mimeType } = await uploadToStorage(file);
      await analyzeIncome(path, mimeType);
    } catch (err) {
      console.error('ファイル処理エラー:', err);
      alert('ファイルの処理に失敗しました。');
      setIsAnalyzing(false);
    }
  };

  // 給与明細AI解析（Storageパスのみ送信）
  const analyzeIncome = async (storagePath: string, mimeType: string) => {
    setIsAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/income-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ storagePath, mimeType }),
      });

      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        console.error('レスポンスがJSONではありません:', response.status, text.substring(0, 200));
        alert('サーバーエラーが発生しました。');
        return;
      }

      // 解析結果をフォームに反映
      if (result.date) setDate(result.date);
      if (result.net_amount) setAmount(String(result.net_amount));
      if (result.gross_amount) setGrossAmount(String(result.gross_amount));
      if (result.source) setSource(result.source);
      if (result.memo) setMemo(result.memo);
      if (result.category_main) setCategoryMain(result.category_main);
      if (result.category_sub) setCategorySub(result.category_sub);
    } catch (error) {
      console.error("給与明細解析エラー:", error);
      alert("給与明細の解析に失敗しました");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // 現在のユーザーIDを取得
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user?.id,
          user_type: selectedUser,
          type: 'income',
          date: date,
          category_main: categoryMain,
          category_sub: categorySub,
          store_name: source,
          amount: Number(amount),
          memo: memo,
          metadata: grossAmount ? { gross_amount: Number(grossAmount) } : null,
          target_month: targetMonth ? `${targetMonth}-01` : null,
          income_month: incomeMonth ? `${incomeMonth}-01` : null,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Supabase保存エラー:', error);
        alert(`保存に失敗しました: ${error.message}`);
        return;
      }

      console.log('保存成功:', data);
      alert('収入を記録しました！');
      
      // データを即座に反映
      triggerRefresh();
      
      // フォームをリセット
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setDate(getJSTDateString());
    setCategoryMain("給与・賞与");
    setCategorySub("給与");
    setSource("");
    setAmount("");
    setGrossAmount("");
    setMemo("");
    setCapturedImage(null);
    setIsPdf(false);
    // 月セレクタをリセット
    const now = new Date();
    setIncomeMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    setTargetMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const getCategoryIcon = (main: string): string => {
    return INCOME_CATEGORIES.find(c => c.main === main)?.icon || "💵";
  };

  const openPicker = () => {
    setPickerTempMain(categoryMain);
    setPickerStep('main');
    setPickerOpen(true);
  };

  const handlePickerSelectSub = (sub: string) => {
    setCategoryMain(pickerTempMain);
    setCategorySub(sub);
    setPickerOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden bg-slate-900/95 backdrop-blur-xl border-slate-700" style={{ overscrollBehavior: 'contain' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white text-base">
            <TrendingUp className="h-4 w-4 text-green-400" />
            収入を記録 - {selectedUser}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            給与明細を撮影・アップロードして自動入力できます
          </DialogDescription>
        </DialogHeader>

        {/* 隠しinput */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 給与明細スキャンボタン */}
        {!capturedImage && !isAnalyzing && (
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleCameraCapture}
              className="flex-1 h-12 text-xs font-bold bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white border-0 shadow-lg"
            >
              <Camera className="h-4 w-4 mr-2" />
              📸 給与明細を撮影
            </Button>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 h-12 text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 shadow-lg"
            >
              <Upload className="h-4 w-4 mr-2" />
              📄 PDF/画像を選択
            </Button>
          </div>
        )}

        {/* 解析中 */}
        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <div className="relative">
              <Loader2 className="h-8 w-8 animate-spin text-green-400" />
              <div className="absolute inset-0 h-8 w-8 animate-ping text-green-400/30">
                <Sparkles className="h-8 w-8" />
              </div>
            </div>
            <p className="text-sm text-green-300 font-medium">給与明細をAI解析中...</p>
            <p className="text-xs text-gray-500">総支給額・差引支給額を読み取っています</p>
          </div>
        )}

        {/* スキャン済みプレビュー */}
        {capturedImage && !isAnalyzing && (
          <div className="relative">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-900/20 border border-green-700/30">
              {isPdf ? (
                <FileText className="h-5 w-5 text-green-400" />
              ) : (
                <NextImage
                  src={capturedImage}
                  alt="給与明細"
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 object-cover rounded"
                />
              )}
              <span className="text-xs text-green-300 flex-1">
                {isPdf ? "PDF解析済み" : "画像解析済み"} ✓
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setCapturedImage(null); setIsPdf(false); }}
                className="h-6 w-6 p-0 text-gray-400 hover:text-white"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* 日付 */}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border">
            <Label htmlFor="date" className="text-sm font-semibold">日付</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="max-w-xs h-8 text-sm bg-white dark:bg-slate-800"
            />
          </div>

          {/* 何月度の収入？（統計用） */}
          <div className="space-y-1.5">
            <Label className="text-xs text-white flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-blue-400" />
              何月度の収入？（統計用）
            </Label>
            <div className="flex gap-1.5">
              {(() => {
                const d = date ? new Date(date) : new Date();
                const thisM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                const prevM = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
                const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
                const nextM = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
                const options = [
                  { label: `${prevD.getMonth() + 1}月度`, value: prevM },
                  { label: `${d.getMonth() + 1}月度`, value: thisM },
                  { label: `${nextD.getMonth() + 1}月度`, value: nextM },
                ];
                return options.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setIncomeMonth(opt.value)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
                      incomeMonth === opt.value
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                        : 'bg-slate-800/50 text-white/50 border-slate-700 hover:bg-slate-700/50 hover:text-white/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                ));
              })()}
            </div>
            <p className="text-[10px] text-white/30">
              年収サマリー・月別推移の統計に使用されます
            </p>
          </div>

          {/* 予算対象月 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-white flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-emerald-400" />
              何月分の予算に充てる？
            </Label>
            <div className="flex gap-1.5">
              {(() => {
                const d = date ? new Date(date) : new Date();
                const thisM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
                const prevM = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
                const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1);
                const nextM = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
                const options = [
                  { label: `${prevD.getMonth() + 1}月`, value: prevM },
                  { label: `${d.getMonth() + 1}月（当月）`, value: thisM },
                  { label: `${nextD.getMonth() + 1}月（翌月）`, value: nextM },
                ];
                return options.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTargetMonth(opt.value)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
                      targetMonth === opt.value
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                        : 'bg-slate-800/50 text-white/50 border-slate-700 hover:bg-slate-700/50 hover:text-white/70'
                    }`}
                  >
                    {opt.label}
                  </button>
                ));
              })()}
            </div>
            <p className="text-[10px] text-white/30">
              ダッシュボード・分析画面での予算計算に反映されます
            </p>
          </div>

          {/* カテゴリー選択ボタン（ピッカーUI） */}
          <div className="space-y-1">
            <Label className="text-xs text-white">カテゴリー</Label>
            <button
              type="button"
              onClick={openPicker}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 transition-all text-left"
            >
              <span className="flex items-center gap-2 text-sm">
                <span>{getCategoryIcon(categoryMain)}</span>
                <span className="font-semibold text-white">{categoryMain}</span>
                <span className="text-white/30">/</span>
                <span className="text-white/60">{categorySub}</span>
              </span>
              <span className="text-[10px] text-green-400 shrink-0">変更 ›</span>
            </button>
          </div>

          {/* 収入源 */}
          <div className="space-y-1">
            <Label className="text-xs text-white">収入源</Label>
            <Input
              placeholder="例：会社名、クライアント名"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
            />
          </div>

          {/* 金額（手取り） */}
          <div className="space-y-1">
            <Label className="text-xs text-white">手取り金額（差引支給額） *</Label>
            <Input
              type="number"
              placeholder="250000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="h-10 text-lg bg-slate-800/50 border-slate-700 text-white font-bold"
            />
          </div>

          {/* 総支給額 */}
          <div className="space-y-1">
            <Label className="text-xs text-white">総支給額（額面）</Label>
            <Input
              type="number"
              placeholder="320000"
              value={grossAmount}
              onChange={(e) => setGrossAmount(e.target.value)}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
            />
            {grossAmount && amount && Number(grossAmount) > 0 && (
              <p className="text-xs text-orange-400">
                控除額: ¥{(Number(grossAmount) - Number(amount)).toLocaleString()}
                （{((1 - Number(amount) / Number(grossAmount)) * 100).toFixed(1)}%）
              </p>
            )}
          </div>

          {/* メモ */}
          <div className="space-y-1">
            <Label className="text-xs text-white">メモ</Label>
            <Input
              placeholder="詳細を入力"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white"
            />
          </div>

          {/* プレビュー */}
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

          {/* 送信ボタン */}
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
        {/* カテゴリーポップアップピッカー */}
        {pickerOpen && createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-auto" onClick={() => setPickerOpen(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative bg-slate-900 border border-white/15 rounded-2xl p-4 w-full max-w-sm flex flex-col"
              style={{ boxShadow: '0 8px 32px rgba(16,185,129,0.25)', maxHeight: '60vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {pickerStep === 'sub' && (
                    <button onClick={() => setPickerStep('main')} className="text-white/50 hover:text-white text-sm mr-1">← 戻る</button>
                  )}
                  <span className="text-sm font-bold text-white">
                    {pickerStep === 'main' ? '収入カテゴリーを選択' : `${getCategoryIcon(pickerTempMain)} ${pickerTempMain} › 小分類`}
                  </span>
                </div>
                <button onClick={() => setPickerOpen(false)} className="text-white/40 hover:text-white text-xs px-2 py-1">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 -mx-1 px-1">
                {pickerStep === 'main' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {INCOME_CATEGORIES.map((cat) => {
                      const isSelected = categoryMain === cat.main;
                      return (
                        <button
                          key={cat.main}
                          type="button"
                          onClick={() => {
                            setPickerTempMain(cat.main);
                            setPickerStep('sub');
                          }}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-green-500/60 bg-green-500/15'
                              : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                          }`}
                          style={isSelected ? { boxShadow: '0 0 12px rgba(16,185,129,0.4)' } : {}}
                        >
                          <span className="text-2xl">{cat.icon}</span>
                          <span className="text-[11px] text-white/80 text-center leading-tight">{cat.main}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(INCOME_CATEGORIES.find(c => c.main === pickerTempMain)?.sub || ["その他"]).map((sub) => {
                      const isSelected = categoryMain === pickerTempMain && categorySub === sub;
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => handlePickerSelectSub(sub)}
                          className={`p-3 rounded-xl border text-sm transition-all ${
                            isSelected
                              ? 'border-green-500/60 bg-green-500/15 text-white font-semibold'
                              : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                          }`}
                          style={isSelected ? { boxShadow: '0 0 12px rgba(16,185,129,0.4)' } : {}}
                        >
                          {sub}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      </DialogContent>
    </Dialog>
  );
}
