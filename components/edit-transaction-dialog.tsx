"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Trash2, Users, User, Plus, X } from "lucide-react";
/* Select removed — replaced by icon picker */
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface ExpenseItem {
  categoryMain: string;
  categorySub: string;
  storeName: string;
  amount: number;
  memo: string;
}

export interface TransactionForEdit {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name?: string | null;
  amount: number;
  memo?: string | null;
  user_type: string;
  type?: string;
  items?: ExpenseItem[] | null;
  metadata?: { gross_amount?: number } | null;
}

interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionForEdit | null;
}

export function EditTransactionDialog({ open, onOpenChange, transaction }: EditTransactionDialogProps) {
  const { triggerRefresh, theme, displayName } = useApp();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [date, setDate] = useState("");
  const [categoryMain, setCategoryMain] = useState("");
  const [categorySub, setCategorySub] = useState("");
  const [storeName, setStoreName] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [memo, setMemo] = useState("");
  const [userType, setUserType] = useState("共同");
  const [transactionType, setTransactionType] = useState("expense");
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [grossAmount, setGrossAmount] = useState<number>(0);

  // カテゴリーピッカー状態
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<'main' | 'sub'>('main');
  const [pickerTempMain, setPickerTempMain] = useState('');
  const [pickerTarget, setPickerTarget] = useState<'single' | number>('single'); // 'single' = 単一品目, number = items[idx]

  // DBから最新のカテゴリを常に取得
  const [dbCategories, setDbCategories] = useState<{ main: string; icon: string; subs: string[] }[]>([]);

  useEffect(() => {
    if (open) {
      // ダイアログが開くたびにDBから最新カテゴリを取得
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

  // transaction が変わったら初期値をセット
  useEffect(() => {
    if (transaction) {
      setDate(transaction.date);
      setCategoryMain(transaction.category_main);
      setCategorySub(transaction.category_sub);
      setStoreName(transaction.store_name || "");
      setAmount(transaction.amount);
      setMemo(transaction.memo || "");
      setUserType(transaction.user_type);
      setTransactionType(transaction.type || "expense");
      setItems(transaction.items && Array.isArray(transaction.items) && transaction.items.length > 1
        ? transaction.items
        : []);
      const meta = typeof transaction.metadata === 'string'
        ? JSON.parse(transaction.metadata)
        : transaction.metadata;
      setGrossAmount(meta?.gross_amount || 0);
    }
  }, [transaction]);

  const getSubcategoriesFromDB = (mainCat: string): string[] => {
    const found = dbCategories.find(c => c.main === mainCat);
    return found?.subs || ["その他"];
  };

  const getCategoryIconFromDB = (mainCat: string): string => {
    const found = dbCategories.find(c => c.main === mainCat);
    return found?.icon || "📦";
  };

  const openPicker = (target: 'single' | number, currentMain: string) => {
    setPickerTarget(target);
    setPickerTempMain(currentMain);
    setPickerStep('main');
    setPickerOpen(true);
  };

  const handlePickerSelectSub = (sub: string) => {
    if (pickerTarget === 'single') {
      setCategoryMain(pickerTempMain);
      setCategorySub(sub);
    } else {
      setItems(prev => {
        const newItems = [...prev];
        newItems[pickerTarget] = {
          ...newItems[pickerTarget],
          categoryMain: pickerTempMain,
          categorySub: sub,
        };
        return newItems;
      });
    }
    setPickerOpen(false);
  };

  const handleCategoryMainChange = (value: string) => {
    setCategoryMain(value);
    const subs = getSubcategoriesFromDB(value);
    setCategorySub(subs[0] || "その他");
  };

  const handleSave = async () => {
    if (!transaction) return;
    setIsSaving(true);

    try {
      const hasItems = items.length > 1;
      const finalAmount = hasItems
        ? items.reduce((sum, item) => sum + item.amount, 0)
        : amount;

      const updateData: Record<string, unknown> = {
        date,
        category_main: hasItems ? items[0].categoryMain : categoryMain,
        category_sub: hasItems ? items[0].categorySub : categorySub,
        store_name: hasItems ? (items[0].storeName || storeName || null) : (storeName || null),
        amount: finalAmount,
        memo: hasItems
          ? items.map(i => i.memo || i.categorySub).join(', ')
          : (memo || null),
        user_type: userType,
      };

      if (hasItems) {
        updateData.items = items.map(item => ({
          categoryMain: item.categoryMain,
          categorySub: item.categorySub,
          storeName: item.storeName,
          amount: item.amount,
          memo: item.memo,
        }));
      }

      if (transactionType === 'income' && grossAmount > 0) {
        updateData.metadata = { gross_amount: grossAmount };
      }

      const { error } = await supabase
        .from("transactions")
        .update(updateData)
        .eq("id", transaction.id);

      if (error) {
        console.error("更新エラー:", error);
        alert(`更新に失敗しました: ${error.message}`);
        return;
      }

      triggerRefresh();
      onOpenChange(false);
    } catch (error) {
      console.error("更新エラー:", error);
      alert("更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!transaction) return;
    if (!confirm("この取引を削除してもよろしいですか？")) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", transaction.id);

      if (error) {
        console.error("削除エラー:", error);
        alert(`削除に失敗しました: ${error.message}`);
        return;
      }

      triggerRefresh();
      onOpenChange(false);
    } catch (error) {
      console.error("削除エラー:", error);
      alert("削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border-slate-700"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2 text-base">
            <Save className="h-4 w-4" style={{ color: theme.primary }} />
            {transactionType === 'income' ? '収入を編集' : '取引を編集'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 個人 / 共同 切替 */}
          <div className="space-y-1">
            <Label className="text-white/70 text-xs">区分</Label>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUserType(displayName || "自分"); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-all ${
                  userType !== "共同"
                    ? "text-white"
                    : "text-white/40 bg-slate-800/50 hover:bg-slate-800/80"
                }`}
                style={userType !== "共同" ? { background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` } : {}}
              >
                <User className="h-3.5 w-3.5" />
                {displayName || "個人"}
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUserType("共同"); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-all ${
                  userType === "共同"
                    ? "text-white bg-purple-600"
                    : "text-white/40 bg-slate-800/50 hover:bg-slate-800/80"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                共同
              </button>
            </div>
          </div>

          {/* 日付 */}
          <div className="space-y-1">
            <Label className="text-white/70 text-xs">日付</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
            />
          </div>

          {/* === 品目編集（items がある場合） === */}
          {items.length > 1 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-white/70 text-xs">品目（{items.length}点）</Label>
                <button
                  type="button"
                  onClick={() => setItems([...items, { categoryMain: "食費", categorySub: "食料品", storeName: "", amount: 0, memo: "" }])}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                  style={{ color: theme.primary }}
                >
                  <Plus className="h-3 w-3" /> 追加
                </button>
              </div>
              
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">品目 {idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400/60 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {/* メモ（品名） & 金額 */}
                    <div className="grid grid-cols-[1fr_100px] gap-2">
                      <Input
                        value={item.memo}
                        onChange={(e) => { const newItems = [...items]; newItems[idx].memo = e.target.value; setItems(newItems); }}
                        placeholder="品名"
                        className="bg-slate-900/50 border-slate-700 text-white h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={item.amount || ""}
                        onChange={(e) => { const newItems = [...items]; newItems[idx].amount = Number(e.target.value); setItems(newItems); }}
                        placeholder="金額"
                        className="bg-slate-900/50 border-slate-700 text-white h-8 text-xs"
                      />
                    </div>
                    {/* カテゴリー選択ボタン */}
                    <button
                      type="button"
                      onClick={() => openPicker(idx, item.categoryMain)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all text-left"
                    >
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="text-sm">{getCategoryIconFromDB(item.categoryMain)}</span>
                        <span className="font-semibold text-white">{item.categoryMain}</span>
                        <span className="text-white/30">/</span>
                        <span className="text-white/60">{item.categorySub}</span>
                      </span>
                      <span className="text-[10px] text-purple-400 shrink-0">変更 ›</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* 合計金額プレビュー */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <span className="text-xs text-white/50">合計金額</span>
                <span className="text-lg font-bold text-red-400">
                  -¥{items.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* 単一品目ヘッダー（追加ボタン付き） */}
              <div className="flex items-center justify-between">
                <Label className="text-white/70 text-xs">品目（1点）</Label>
                <button
                  type="button"
                  onClick={() => setItems([
                    { categoryMain, categorySub, storeName, amount, memo },
                    { categoryMain: "食費", categorySub: "食料品", storeName: "", amount: 0, memo: "" }
                  ])}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                  style={{ color: theme.primary }}
                >
                  <Plus className="h-3 w-3" /> 追加
                </button>
              </div>
              {/* カテゴリー選択ボタン */}
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">カテゴリー</Label>
                <button
                  type="button"
                  onClick={() => openPicker('single', categoryMain)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all text-left"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span>{getCategoryIconFromDB(categoryMain)}</span>
                    <span className="font-semibold text-white">{categoryMain}</span>
                    <span className="text-white/30">/</span>
                    <span className="text-white/60">{categorySub}</span>
                  </span>
                  <span className="text-[10px] text-purple-400 shrink-0">変更 ›</span>
                </button>
              </div>

              {/* 店名 & 金額 */}
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">{transactionType === 'income' ? '収入源' : '店名'}</Label>
                  <Input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder={transactionType === 'income' ? '会社名' : 'スーパー○○'}
                    className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">{transactionType === 'income' ? '手取り金額' : '金額'}</Label>
                  <Input
                    type="number"
                    value={amount || ""}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
                  />
                </div>
              </div>

              {/* 収入の場合: 総支給額 */}
              {transactionType === 'income' && (
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">総支給額（額面）</Label>
                  <Input
                    type="number"
                    value={grossAmount || ""}
                    onChange={(e) => setGrossAmount(Number(e.target.value))}
                    placeholder="320000"
                    className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
                  />
                  {grossAmount > 0 && amount > 0 && (
                    <p className="text-xs text-orange-400">
                      控除額: ¥{(grossAmount - amount).toLocaleString()}（{((1 - amount / grossAmount) * 100).toFixed(1)}%）
                    </p>
                  )}
                </div>
              )}

              {/* メモ */}
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">メモ</Label>
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="詳細を入力"
                  className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
                />
              </div>
            </>
          )}

          {/* ボタン */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSave(); }}
              disabled={isSaving || isDeleting}
              className="flex-1 h-10 text-sm font-semibold"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
            >
              {isSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />保存中...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />保存</>
              )}
            </Button>
            <Button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
              disabled={isSaving || isDeleting}
              variant="destructive"
              className="h-10 text-sm px-4"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* カテゴリーポップアップピッカー（Portalで画面中央に固定表示） */}
        {pickerOpen && createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-auto" onClick={() => setPickerOpen(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative bg-slate-900 border border-white/15 rounded-2xl p-4 w-full max-w-sm flex flex-col"
              style={{ boxShadow: '0 8px 32px rgba(120,60,255,0.25)', maxHeight: '60vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {pickerStep === 'sub' && (
                    <button onClick={() => setPickerStep('main')} className="text-white/50 hover:text-white text-sm mr-1">← 戻る</button>
                  )}
                  <span className="text-sm font-bold text-white">
                    {pickerStep === 'main' ? 'カテゴリーを選択' : `${getCategoryIconFromDB(pickerTempMain)} ${pickerTempMain} › 小分類`}
                  </span>
                </div>
                <button onClick={() => setPickerOpen(false)} className="text-white/40 hover:text-white text-xs px-2 py-1">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 -mx-1 px-1">
                {pickerStep === 'main' ? (
                  <div className="grid grid-cols-3 gap-2">
                    {dbCategories.map((cat) => {
                      const currentMain = pickerTarget === 'single' ? categoryMain : items[pickerTarget]?.categoryMain;
                      const isSelected = currentMain === cat.main;
                      return (
                        <button
                          key={cat.main}
                          type="button"
                          onClick={() => {
                            setPickerTempMain(cat.main);
                            setPickerStep('sub');
                          }}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-purple-500/60 bg-purple-500/15'
                              : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                          }`}
                          style={isSelected ? { boxShadow: '0 0 12px rgba(168,85,247,0.4)' } : {}}
                        >
                          <span className="text-2xl">{cat.icon}</span>
                          <span className="text-[11px] text-white/80 text-center leading-tight">{cat.main}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {getSubcategoriesFromDB(pickerTempMain).map((sub) => {
                      const currentMain = pickerTarget === 'single' ? categoryMain : items[pickerTarget as number]?.categoryMain;
                      const currentSub = pickerTarget === 'single' ? categorySub : items[pickerTarget as number]?.categorySub;
                      const isSelected = currentMain === pickerTempMain && currentSub === sub;
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => handlePickerSelectSub(sub)}
                          className={`p-3 rounded-xl border text-sm transition-all ${
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
          </div>,
          document.body
        )}
      </DialogContent>
    </Dialog>
  );
}
