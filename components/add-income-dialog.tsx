"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Loader2, Sparkles, Camera, Upload, X, FileText } from "lucide-react";
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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryMain, setCategoryMain] = useState("給与・賞与");
  const [categorySub, setCategorySub] = useState("給与");
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [grossAmount, setGrossAmount] = useState<string>("");
  const [memo, setMemo] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ネイティブカメラを起動
  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  // カメラ撮影結果の処理
  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target?.result as string;
        setCapturedImage(imageData);
        setIsPdf(false);
        analyzeIncome(imageData, file.type);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // ファイルから画像/PDFを読み込み
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileData = event.target?.result as string;
        const isFilePdf = file.type === 'application/pdf';
        setCapturedImage(fileData);
        setIsPdf(isFilePdf);
        analyzeIncome(fileData, file.type);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  // 給与明細AI解析
  const analyzeIncome = async (imageData: string, mimeType: string) => {
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
        body: JSON.stringify({
          imageBase64: imageData,
          mimeType: mimeType || 'image/jpeg',
        }),
      });

      const result = await response.json();

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
    setDate(new Date().toISOString().split('T')[0]);
    setCategoryMain("給与・賞与");
    setCategorySub("給与");
    setSource("");
    setAmount("");
    setGrossAmount("");
    setMemo("");
    setCapturedImage(null);
    setIsPdf(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleCategoryMainChange = (value: string) => {
    setCategoryMain(value);
    const category = INCOME_CATEGORIES.find(c => c.main === value);
    if (category) {
      setCategorySub(category.sub[0]);
    }
  };

  const selectedCategory = INCOME_CATEGORIES.find(c => c.main === categoryMain);
  const subcategories = selectedCategory?.sub || ["その他"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900/95 backdrop-blur-xl border-slate-700">
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
              variant="outline"
              onClick={handleCameraCapture}
              className="flex-1 h-12 text-xs bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-700/50 hover:from-green-900/50 hover:to-emerald-900/50 text-green-300"
            >
              <Camera className="h-4 w-4 mr-2" />
              📸 給与明細を撮影
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 h-12 text-xs bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border-blue-700/50 hover:from-blue-900/50 hover:to-indigo-900/50 text-blue-300"
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
                <img
                  src={capturedImage}
                  alt="給与明細"
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

          {/* カテゴリー */}
          <div className="grid gap-2 grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-white">カテゴリー（大）*</Label>
              <Select value={categoryMain} onValueChange={handleCategoryMainChange}>
                <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_CATEGORIES.map((category) => (
                    <SelectItem key={category.main} value={category.main}>
                      {category.icon} {category.main}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-white">カテゴリー（小）*</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
      </DialogContent>
    </Dialog>
  );
}
