"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, Sparkles, Upload, X, Plus, Trash2, Calendar, FileText } from "lucide-react";
import { type ReceiptAnalysisResult, type ExpenseItem } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: string;
}

export function AddExpenseDialog({ open, onOpenChange, selectedUser }: AddExpenseDialogProps) {
  const { triggerRefresh } = useApp();
  
  // DBからカテゴリを常に最新で取得
  const [dbCategories, setDbCategories] = useState<{ main: string; icon: string; subs: string[] }[]>([]);
  
  useEffect(() => {
    if (open) {
      supabase
        .from('categories')
        .select('main_category, icon, subcategories')
        .order('sort_order')
        .then(({ data }) => {
          if (data) {
            setDbCategories(data.map(d => ({
              main: d.main_category,
              icon: d.icon || '📦',
              subs: d.subcategories || ['その他'],
            })));
          }
        });
    }
  }, [open]);
  
  const getSubcategoriesFromDB = (mainCat: string): string[] => {
    const found = dbCategories.find(c => c.main === mainCat);
    return found?.subs || ["その他"];
  };
  
  const getCategoryIconFromDB = (mainCat: string): string => {
    const found = dbCategories.find(c => c.main === mainCat);
    return found?.icon || "📦";
  };
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [continuousScan, setContinuousScan] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<ExpenseItem[]>([
    {
      categoryMain: "食費",
      categorySub: "食料品",
      storeName: "",
      amount: 0,
      memo: "",
    }
  ]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ファイル拡張子からMIMEタイプを推定（HEIC等ブラウザが認識しない形式対応）
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

  // Supabase Storageに画像をアップロードし、パスを返す
  // → Vercelの4.5MB制限を完全回避（APIにはパスのみ送信）
  const uploadToStorage = async (file: File): Promise<{ path: string; mimeType: string }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('認証が必要です');

    const userId = session.user.id;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}/${Date.now()}.${ext}`;
    const contentType = detectMimeType(file);

    console.log(`Storageアップロード開始: ${(file.size / 1024 / 1024).toFixed(2)}MB (${contentType})`);

    const { error } = await supabase.storage
      .from('receipt-images')
      .upload(fileName, file, {
        cacheControl: '300',
        upsert: false,
        contentType,
      });

    if (error) {
      console.error('Storageアップロードエラー:', error);
      throw new Error(`アップロード失敗: ${error.message}`);
    }

    console.log(`Storageアップロード完了: ${fileName}`);
    return { path: fileName, mimeType: contentType };
  };

  // ネイティブカメラを起動（iOS/Android対応）
  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  // カメラ撮影結果の処理
  const handleCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // プレビュー用にData URLを設定（表示のみ）
    const previewUrl = URL.createObjectURL(file);
    setCapturedImage(previewUrl);
    setIsPdf(false);

    try {
      const { path, mimeType } = await uploadToStorage(file);
      await analyzeImage(path, mimeType);
    } catch (err) {
      console.error('カメラ処理エラー:', err);
      alert('画像の処理に失敗しました。もう一度お試しください。');
      setIsAnalyzing(false);
    }
  };

  // ファイルから画像/PDFを読み込み
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const isFilePdf = file.type === 'application/pdf';
    const previewUrl = URL.createObjectURL(file);
    setCapturedImage(previewUrl);
    setIsPdf(isFilePdf);

    try {
      const { path, mimeType } = await uploadToStorage(file);
      await analyzeImage(path, mimeType);
    } catch (err) {
      console.error('ファイル処理エラー:', err);
      alert('ファイルの処理に失敗しました。もう一度お試しください。');
      setIsAnalyzing(false);
    }
  };

  // サーバーサイドAPIでレシート解析（Storageパスのみ送信 → 413エラー原理的に不可能）
  const analyzeImage = async (storagePath: string, mimeType: string) => {
    setIsAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ storagePath, mimeType }),
      });

      // レスポンスボディを安全にパース
      const text = await response.text();
      let result: ReceiptAnalysisResult;
      try {
        result = JSON.parse(text);
      } catch {
        console.error('レスポンスがJSONではありません:', response.status, text.substring(0, 200));
        alert('サーバーエラーが発生しました。もう一度お試しください。');
        return;
      }

      if (!response.ok) {
        console.error('API error:', response.status, result);
        alert(`解析エラー (${response.status}): もう一度お試しください。`);
        return;
      }

      // 解析結果をフォームに反映（部分的な結果でも受け入れる）
      if (result.date) setDate(result.date);
      if (result.items && result.items.length > 0) {
        setItems(result.items.map(item => ({
          categoryMain: item.categoryMain || "その他",
          categorySub: item.categorySub || "その他",
          storeName: item.storeName || "",
          amount: item.amount || 0,
          memo: item.memo || "",
        })));
      }
    } catch (error) {
      console.error("レシート解析エラー:", error);
      alert("レシートの解析に失敗しました。手動で入力してください。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 項目を追加
  const addItem = () => {
    setItems([...items, {
      categoryMain: "食費",
      categorySub: "食料品",
      storeName: "",
      amount: 0,
      memo: "",
    }]);
  };

  // 項目を削除
  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  // 項目を更新
  const updateItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // 大カテゴリーが変更された場合、小カテゴリーをリセット
    if (field === 'categoryMain') {
      const subcategories = getSubcategoriesFromDB(value as string);
      newItems[index].categorySub = subcategories[0];
    }
    
    setItems(newItems);
  };

  // フォーム送信（Supabaseに保存）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // 現在のユーザーIDを取得
      const { data: { user } } = await supabase.auth.getUser();
      
      if (items.length > 1) {
        // 複数項目 → 1つのトランザクション + items JSONB に格納
        const { error } = await supabase
          .from('transactions')
          .insert({
            user_id: user?.id,
            user_type: selectedUser,
            type: 'expense',
            date: date,
            category_main: items[0].categoryMain,
            category_sub: items[0].categorySub,
            store_name: items[0].storeName,
            amount: totalAmount,
            memo: items.map(i => i.memo || i.categorySub).join(', '),
            items: items.map(item => ({
              categoryMain: item.categoryMain,
              categorySub: item.categorySub,
              storeName: item.storeName,
              amount: item.amount,
              memo: item.memo,
            })),
          });

        if (error) {
          console.error('Supabase保存エラー:', error);
          alert(`保存に失敗しました: ${error.message}`);
          return;
        }
      } else {
        // 単一項目 → 通常のトランザクション
        const item = items[0];
        const { error } = await supabase
          .from('transactions')
          .insert({
            user_id: user?.id,
            user_type: selectedUser,
            type: 'expense',
            date: date,
            category_main: item.categoryMain,
            category_sub: item.categorySub,
            store_name: item.storeName,
            amount: item.amount,
            memo: item.memo,
          });

        if (error) {
          console.error('Supabase保存エラー:', error);
          alert(`保存に失敗しました: ${error.message}`);
          return;
        }
      }

      alert('支出を追加しました！');
      
      // 共同支出の場合、パートナーに Push 通知を送信
      if (selectedUser === "共同") {
        try {
          const memoText = items[0]?.memo || items[0]?.storeName || items[0]?.categorySub || "支出";
          await fetch("/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "共同支出が登録されました",
              body: `¥${totalAmount.toLocaleString()} (${memoText})`,
              excludeUserId: user?.id,
            }),
          });
        } catch (pushError) {
          console.error("Push通知送信エラー:", pushError);
        }
      }

      // 予算アラートチェック
      try {
        await checkBudgetAlerts(user?.id || '', selectedUser, items, totalAmount);
      } catch (alertError) {
        console.error("予算アラートチェックエラー:", alertError);
      }
      
      // データを即座に反映
      triggerRefresh();
      
      // 連続スキャンモードの場合、フォームリセットしてカメラを再起動
      if (continuousScan) {
        setScanCount(prev => prev + 1);
        resetForm();
        // 少し待ってからカメラを起動
        setTimeout(() => {
          cameraInputRef.current?.click();
        }, 500);
        return;
      }
      
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

  // フォームをリセット
  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setItems([{
      categoryMain: "食費",
      categorySub: "食料品",
      storeName: "",
      amount: 0,
      memo: "",
    }]);
    setCapturedImage(null);
    setIsPdf(false);
  };

  // 予算アラートチェック
  const checkBudgetAlerts = async (userId: string, userType: string, savedItems: typeof items, savedTotal: number) => {
    try {
      // 今月の範囲
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      // 予算取得
      const { data: budgets } = await supabase
        .from('budgets')
        .select('category_main, monthly_budget')
        .eq('user_type', userType);

      if (!budgets || budgets.length === 0) return;

      // 今月の支出取得
      const { data: monthExpenses } = await supabase
        .from('transactions')
        .select('amount, category_main, items')
        .eq('user_type', userType)
        .eq('type', 'expense')
        .gte('date', monthStart)
        .lte('date', monthEnd);

      // カテゴリ別支出集計
      const spentMap: Record<string, number> = {};
      monthExpenses?.forEach(t => {
        if (t.items && Array.isArray(t.items) && t.items.length > 0) {
          (t.items as Array<{ categoryMain: string; amount: number }>).forEach(item => {
            spentMap[item.categoryMain] = (spentMap[item.categoryMain] || 0) + item.amount;
          });
        } else {
          spentMap[t.category_main] = (spentMap[t.category_main] || 0) + t.amount;
        }
      });

      // アラート対象のカテゴリを検出
      const alerts: string[] = [];
      for (const budget of budgets) {
        const spent = spentMap[budget.category_main] || 0;
        const pct = budget.monthly_budget > 0 ? (spent / budget.monthly_budget) * 100 : 0;
        const remaining = budget.monthly_budget - spent;

        if (pct >= 100) {
          alerts.push(`⚠️ ${budget.category_main}の予算を超過しました（¥${(-remaining).toLocaleString()}オーバー）`);
        } else if (pct >= 80) {
          alerts.push(`⚠ ${budget.category_main}があと¥${remaining.toLocaleString()}で上限です`);
        }
      }

      // アラートがあればPush通知
      if (alerts.length > 0) {
        await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: '予算アラート',
            body: alerts.join('\n'),
            targetUserId: userId,
          }),
        });
      }
    } catch (err) {
      console.error('予算アラートチェックエラー:', err);
    }
  };

  // ダイアログを閉じる際のクリーンアップ
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
      setContinuousScan(false);
      setScanCount(0);
    }
    onOpenChange(newOpen);
  };

  // 合計金額を計算
  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-purple-600" />
            支出を追加 - {selectedUser}
          </DialogTitle>
          <DialogDescription className="text-xs">
            レシートをカメラで撮影すると、AIが自動で複数の項目に分類します
          </DialogDescription>
        </DialogHeader>

        {/* AI解析中のアニメーション */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-background/95 backdrop-blur-md z-10 flex items-center justify-center rounded-lg">
            <div className="text-center space-y-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full blur-xl opacity-50 animate-pulse"></div>
                <Loader2 className="h-16 w-16 animate-spin text-purple-600 mx-auto relative" />
                <Sparkles className="h-8 w-8 text-yellow-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent animate-pulse">
                  AIが読み取り中...
                </p>
                <p className="text-xs text-muted-foreground">
                  レシート情報を解析して項目を分類しています
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* カメラ/アップロードセクション（iOSネイティブカメラ対応 + PDF対応） */}
          {!capturedImage && (
            <div className="grid gap-2 grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-20 border-dashed border-2 hover:border-purple-600 hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50 dark:hover:from-purple-950 dark:hover:to-pink-950 transition-all text-xs"
                onClick={handleCameraCapture}
              >
                <div className="flex flex-col items-center gap-1">
                  <Camera className="h-6 w-6" />
                  <span className="font-semibold">カメラで撮影</span>
                </div>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-20 border-dashed border-2 hover:border-blue-600 hover:bg-gradient-to-br hover:from-blue-50 hover:to-cyan-50 dark:hover:from-blue-950 dark:hover:to-cyan-950 transition-all text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-1">
                  <Upload className="h-6 w-6" />
                  <span className="font-semibold">画像 / PDF</span>
                </div>
              </Button>
              {/* カメラ用: capture属性でiOS/Androidネイティブカメラを起動 */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraChange}
              />
              {/* アップロード用: 画像 + PDF対応 */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* プレビュー（画像 or PDFアイコン） */}
          {capturedImage && (
            <div className="relative rounded-lg overflow-hidden border border-purple-200 dark:border-purple-800 shadow-lg">
              {isPdf ? (
                <div className="flex items-center justify-center gap-2 p-6 bg-slate-100 dark:bg-slate-800">
                  <FileText className="h-10 w-10 text-red-500" />
                  <span className="text-sm font-semibold">PDFファイル</span>
                </div>
              ) : (
                <img src={capturedImage} alt="撮影したレシート" className="w-full" />
              )}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="absolute top-2 right-2 rounded-full h-7 w-7 p-0"
                onClick={() => { setCapturedImage(null); setIsPdf(false); }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* 入力フォーム */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* 日付選択 */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border">
              <Calendar className="h-4 w-4 text-purple-600" />
              <Label htmlFor="date" className="text-sm font-semibold">日付</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="max-w-xs h-8 text-sm"
              />
            </div>

            {/* 項目リスト */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  支出項目
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  className="gap-1 h-7 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  追加
                </Button>
              </div>

              {items.map((item, index) => (
                <div 
                  key={index} 
                  className="p-3 rounded-lg border bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow hover:shadow-lg transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-lg font-bold text-purple-600">#{index + 1}</span>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-2 grid-cols-2">
                    {/* 大カテゴリー */}
                    <div className="space-y-1">
                      <Label className="text-xs">カテゴリー（大）*</Label>
                      <Select 
                        value={item.categoryMain} 
                        onValueChange={(value) => updateItem(index, 'categoryMain', value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dbCategories.map((category) => (
                            <SelectItem key={category.main} value={category.main}>
                              {category.icon} {category.main}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 小カテゴリー */}
                    <div className="space-y-1">
                      <Label className="text-xs">カテゴリー（小）*</Label>
                      <Select 
                        value={item.categorySub} 
                        onValueChange={(value) => updateItem(index, 'categorySub', value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getSubcategoriesFromDB(item.categoryMain).map((sub) => (
                            <SelectItem key={sub} value={sub}>
                              {sub}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2 grid-cols-2">
                    {/* 店名 */}
                    <div className="space-y-1">
                      <Label className="text-xs">店名</Label>
                      <Input
                        placeholder="スーパー○○"
                        value={item.storeName}
                        onChange={(e) => updateItem(index, 'storeName', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* 金額 */}
                    <div className="space-y-1">
                      <Label className="text-xs">金額 *</Label>
                      <Input
                        type="number"
                        placeholder="1000"
                        value={item.amount || ''}
                        onChange={(e) => updateItem(index, 'amount', Number(e.target.value))}
                        required
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* メモ */}
                  <div className="space-y-1">
                    <Label className="text-xs">メモ</Label>
                    <Input
                      placeholder="詳細を入力"
                      value={item.memo}
                      onChange={(e) => updateItem(index, 'memo', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* 合計金額表示 */}
            <div className="p-2 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">合計金額</span>
                <span className="text-xl font-bold text-green-600">
                  ¥{totalAmount.toLocaleString()}
                </span>
              </div>
            </div>

            {/* 連続スキャンモード + 送信ボタン */}
            <div className="space-y-2">
              {/* 連続スキャントグル */}
              <button
                type="button"
                onClick={() => setContinuousScan(!continuousScan)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all text-xs ${
                  continuousScan
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                    : 'bg-white/5 border-white/10 text-white/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Camera className="h-3.5 w-3.5" />
                  連続スキャンモード
                  {scanCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                      {scanCount}枚完了
                    </span>
                  )}
                </span>
                <div className={`w-8 h-4 rounded-full transition-colors flex items-center ${
                  continuousScan ? 'bg-purple-500 justify-end' : 'bg-white/20 justify-start'
                }`}>
                  <div className="w-3 h-3 rounded-full bg-white mx-0.5" />
                </div>
              </button>
              {continuousScan && (
                <p className="text-[10px] text-purple-300/60 px-1">
                  保存後、自動的にカメラが起動して次のレシートをスキャンできます
                </p>
              )}

              {/* ボタン行 */}
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  className="flex-1 h-10 text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      保存中...
                    </>
                  ) : continuousScan ? (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      保存して次をスキャン
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      支出を追加
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
                  {continuousScan && scanCount > 0 ? '完了' : 'キャンセル'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
