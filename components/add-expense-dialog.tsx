"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
            const cats = data.map(d => ({
              main: d.main_category,
              icon: d.icon || '📦',
              subs: d.subcategories || ['その他'],
            }));
            setDbCategories(cats);
            dbCategoriesRef.current = cats;
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
  const [analysisStage, setAnalysisStage] = useState<'uploading' | 'analyzing'>('uploading');
  const dbCategoriesRef = useRef<{ main: string; icon: string; subs: string[] }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // カテゴリーピッカー状態
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItemIndex, setPickerItemIndex] = useState(0);
  const [pickerStep, setPickerStep] = useState<'main' | 'sub'>('main');
  const [pickerTempMain, setPickerTempMain] = useState('');
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

  // 画像をCanvas APIでリサイズ・圧縮してアップロード時間を短縮（PDFはそのまま）
  const compressImage = async (file: File): Promise<File> => {
    if (file.type === 'application/pdf' || file.type.includes('heic') || file.type.includes('heif')) return file;
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
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

    const previewUrl = URL.createObjectURL(file);
    setCapturedImage(previewUrl);
    setIsPdf(false);
    setIsAnalyzing(true);
    setAnalysisStage('uploading');

    try {
      const compressed = await compressImage(file);
      const { path, mimeType } = await uploadToStorage(compressed);
      setAnalysisStage('analyzing');
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
    setIsAnalyzing(true);
    setAnalysisStage('uploading');

    try {
      const compressed = await compressImage(file);
      const { path, mimeType } = await uploadToStorage(compressed);
      setAnalysisStage('analyzing');
      await analyzeImage(path, mimeType);
    } catch (err) {
      console.error('ファイル処理エラー:', err);
      alert('ファイルの処理に失敗しました。もう一度お試しください。');
      setIsAnalyzing(false);
    }
  };

  // サーバーサイドAPIでレシート解析（Storageパスのみ送信 → 413エラー原理的に不可能）
  const analyzeImage = async (storagePath: string, mimeType: string) => {
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
        const cats = dbCategoriesRef.current;
        setItems(result.items.map(item => {
          const main = item.categoryMain || "その他";
          const catEntry = cats.find(c => c.main === main);
          const validMain = catEntry ? main : (cats[0]?.main || "その他");
          const validSubs = cats.find(c => c.main === validMain)?.subs || ["その他"];
          const sub = item.categorySub && validSubs.includes(item.categorySub)
            ? item.categorySub
            : validSubs[0] || "その他";
          return {
            categoryMain: validMain,
            categorySub: sub,
            storeName: item.storeName || "",
            amount: item.amount || 0,
            memo: item.memo || "",
          };
        }));
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
      // 現在のユーザーIDとセッションを取得
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || "";
      let insertedTxId: string | null = null;
      
      if (items.length > 1) {
        // 複数項目 → 1つのトランザクション + items JSONB に格納
        const { data: inserted, error } = await supabase
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
          })
          .select('id')
          .single();

        if (error) {
          console.error('Supabase保存エラー:', error);
          alert(`保存に失敗しました: ${error.message}`);
          return;
        }
        insertedTxId = inserted?.id || null;
      } else {
        // 単一項目 → 通常のトランザクション
        const item = items[0];
        const { data: inserted, error } = await supabase
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
          })
          .select('id')
          .single();

        if (error) {
          console.error('Supabase保存エラー:', error);
          alert(`保存に失敗しました: ${error.message}`);
          return;
        }
        insertedTxId = inserted?.id || null;
      }

      alert('支出を追加しました！');
      
      // 共同支出の場合、パートナーに Push 通知を送信
      if (selectedUser === "共同") {
        try {
          const memoText = items[0]?.memo || items[0]?.storeName || items[0]?.categorySub || "支出";
          await fetch("/api/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
            body: JSON.stringify({
              title: "共同支出が登録されました",
              body: `¥${totalAmount.toLocaleString()} (${memoText})`,
              excludeUserId: user?.id,
              notificationType: "joint_expense_alert",
              url: `/?page=kakeibo&tab=history&date=${date}${insertedTxId ? `&txId=${insertedTxId}` : ""}`,
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
      const alertMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthStart = `${alertMonth}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthEnd = `${alertMonth}-${String(lastDay.getDate()).padStart(2, '0')}`;

      // 今追加した支出のカテゴリのみチェック
      const affectedCategories = new Set(savedItems.map(i => i.categoryMain));

      // 予算取得（対象カテゴリのみ）
      const { data: budgets } = await supabase
        .from('budgets')
        .select('category_main, monthly_budget')
        .eq('user_type', userType);

      if (!budgets || budgets.length === 0) return;

      const relevantBudgets = budgets.filter(b => affectedCategories.has(b.category_main));
      if (relevantBudgets.length === 0) return;

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

      // 既存のアラートログを取得（重複防止）
      const { data: existingLogs } = await supabase
        .from('budget_alert_logs')
        .select('category_main, alert_type')
        .eq('user_id', userId)
        .eq('user_type', userType)
        .eq('alert_month', alertMonth);

      const sentSet = new Set(
        (existingLogs || []).map(l => `${l.category_main}:${l.alert_type}`)
      );

      // アラート対象のカテゴリを検出
      const alerts: string[] = [];
      const newLogs: { user_id: string; user_type: string; category_main: string; alert_type: string; alert_month: string }[] = [];

      for (const budget of relevantBudgets) {
        const spent = spentMap[budget.category_main] || 0;
        const pct = budget.monthly_budget > 0 ? (spent / budget.monthly_budget) * 100 : 0;
        const remaining = budget.monthly_budget - spent;

        if (pct >= 100 && !sentSet.has(`${budget.category_main}:100`)) {
          alerts.push(`⚠️ ${budget.category_main}の予算を超過しました（¥${(-remaining).toLocaleString()}オーバー）`);
          newLogs.push({ user_id: userId, user_type: userType, category_main: budget.category_main, alert_type: '100', alert_month: alertMonth });
        } else if (pct >= 80 && pct < 100 && !sentSet.has(`${budget.category_main}:80`)) {
          alerts.push(`⚠ ${budget.category_main}があと¥${remaining.toLocaleString()}で上限です`);
          newLogs.push({ user_id: userId, user_type: userType, category_main: budget.category_main, alert_type: '80', alert_month: alertMonth });
        }
      }

      // アラートがあればPush通知
      if (alerts.length > 0) {
        const { data: { session: alertSession } } = await supabase.auth.getSession();
        const alertToken = alertSession?.access_token || "";
        await fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alertToken}` },
          body: JSON.stringify({
            title: '予算アラート',
            body: alerts.join('\n'),
            targetUserId: userId,
            notificationType: 'budget_alert',
            url: `/?page=kakeibo&tab=analysis`,
          }),
        });

        // 送信ログを記録
        if (newLogs.length > 0) {
          await supabase.from('budget_alert_logs').insert(newLogs);
        }
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

        {/* AI解析中のアニメーション（近未来スキャナー） */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl z-10 flex items-center justify-center rounded-lg overflow-hidden">
            {/* 背景グリッド */}
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'linear-gradient(rgba(120,80,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(120,80,255,0.3) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            {/* スキャンライン */}
            <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-80"
              style={{ animation: 'scanline 2s ease-in-out infinite', top: '20%' }} />
            <style>{`
              @keyframes scanline { 0%,100%{top:20%;opacity:0} 10%{opacity:1} 90%{opacity:1} 50%{top:80%} }
              @keyframes cornerPulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
            `}</style>
            {/* コーナーマーカー */}
            {[['top-6 left-6','border-t-2 border-l-2'],['top-6 right-6','border-t-2 border-r-2'],['bottom-6 left-6','border-b-2 border-l-2'],['bottom-6 right-6','border-b-2 border-r-2']].map(([pos, cls], i) => (
              <div key={i} className={`absolute w-6 h-6 border-purple-400 ${pos} ${cls}`} style={{ animation: `cornerPulse 1.5s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
            <div className="text-center space-y-4 px-8">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
                <div className="absolute inset-1 rounded-full border border-purple-400/60 animate-spin" style={{ animationDuration: '3s' }} />
                <div className="absolute inset-3 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-base font-bold tracking-widest text-purple-300 uppercase">
                  {analysisStage === 'uploading' ? 'UPLOADING...' : 'AI SCANNING...'}
                </p>
                <p className="text-xs text-white/40 tracking-wide">
                  {analysisStage === 'uploading' ? '画像を送信中' : 'レシートを解析・分類中'}
                </p>
                <div className="flex justify-center gap-1 mt-1">
                  {[0,1,2,3,4].map(i => (
                    <div key={i} className="w-1 h-4 rounded-full bg-purple-500"
                      style={{ animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`, animationName: 'none', opacity: 0.3 + (i % 3) * 0.25 }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* カテゴリーボトムシートピッカー */}
        {pickerOpen && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end rounded-lg overflow-hidden">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
            <div className="relative bg-slate-900/95 border-t border-white/10 rounded-t-2xl p-4 pb-6 max-h-[70%] flex flex-col"
              style={{ boxShadow: '0 -8px 32px rgba(120,60,255,0.15)' }}>
              {/* ハンドル */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {pickerStep === 'sub' && (
                    <button onClick={() => setPickerStep('main')} className="text-white/50 hover:text-white text-xs mr-1">←</button>
                  )}
                  <span className="text-sm font-bold text-white">
                    {pickerStep === 'main' ? 'カテゴリーを選択' : `${pickerTempMain} › 小分類`}
                  </span>
                </div>
                <button onClick={() => setPickerOpen(false)} className="text-white/40 hover:text-white text-xs px-2 py-1">✕</button>
              </div>
              <div className="overflow-y-auto flex-1">
                {pickerStep === 'main' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {dbCategories.map((cat) => {
                      const isSelected = items[pickerItemIndex]?.categoryMain === cat.main;
                      return (
                        <button
                          key={cat.main}
                          type="button"
                          onClick={() => {
                            setPickerTempMain(cat.main);
                            setPickerStep('sub');
                          }}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-purple-500/60 bg-purple-500/15'
                              : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                          }`}
                          style={isSelected ? { boxShadow: '0 0 12px rgba(168,85,247,0.4)' } : {}}
                        >
                          <span className="text-2xl">{cat.icon}</span>
                          <span className="text-xs text-white/80 text-center leading-tight">{cat.main}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {getSubcategoriesFromDB(pickerTempMain).map((sub) => {
                      const isSelected = items[pickerItemIndex]?.categoryMain === pickerTempMain && items[pickerItemIndex]?.categorySub === sub;
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => {
                            updateItem(pickerItemIndex, 'categoryMain', pickerTempMain);
                            updateItem(pickerItemIndex, 'categorySub', sub);
                            setPickerOpen(false);
                          }}
                          className={`p-3 rounded-xl border text-xs transition-all ${
                            isSelected
                              ? 'border-purple-500/60 bg-purple-500/15 text-white font-semibold'
                              : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/70'
                          }`}
                          style={isSelected ? { boxShadow: '0 0 12px rgba(168,85,247,0.4)' } : {}}
                        >
                          {sub}
                        </button>
                      );
                    })}
                  </div>
                )}
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

                  {/* カテゴリー選択ボタン（ボトムシートピッカーを開く） */}
                  <button
                    type="button"
                    onClick={() => {
                      setPickerItemIndex(index);
                      setPickerTempMain(item.categoryMain);
                      setPickerStep('main');
                      setPickerOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-all text-left"
                  >
                    <span className="flex items-center gap-2 text-xs text-white/80">
                      <span className="text-base">{getCategoryIconFromDB(item.categoryMain)}</span>
                      <span>{item.categoryMain}</span>
                      <span className="text-white/30">/</span>
                      <span className="text-white/60">{item.categorySub}</span>
                    </span>
                    <span className="text-[10px] text-white/30 shrink-0">変更 ›</span>
                  </button>

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
