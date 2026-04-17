"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Trash2, Users, User, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { CategoryPicker } from "@/components/scan/category-picker";

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

const DEFAULT_EXTRA_ITEM: ExpenseItem = {
  categoryMain: "食費",
  categorySub: "食料品",
  storeName: "",
  amount: 0,
  memo: "",
};

type PickerTarget = "single" | number;

export function EditTransactionDialog({
  open,
  onOpenChange,
  transaction,
}: EditTransactionDialogProps) {
  const {
    triggerRefresh,
    theme,
    displayName,
    categories: dbCategories,
  } = useApp();
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

  const itemsEndRef = useRef<HTMLDivElement>(null);
  const prevItemsLengthRef = useRef(0);

  // 項目追加時に末尾へスクロール
  useEffect(() => {
    if (
      items.length > prevItemsLengthRef.current &&
      prevItemsLengthRef.current > 0
    ) {
      setTimeout(() => {
        itemsEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
    }
    prevItemsLengthRef.current = items.length;
  }, [items.length]);

  // カテゴリーピッカー状態
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>("single");

  // transaction が変わったら初期値をセット
  useEffect(() => {
    if (!transaction) return;
    setDate(transaction.date);
    setCategoryMain(transaction.category_main);
    setCategorySub(transaction.category_sub);
    setStoreName(transaction.store_name || "");
    setAmount(transaction.amount);
    setMemo(transaction.memo || "");
    setUserType(transaction.user_type);
    setTransactionType(transaction.type || "expense");
    setItems(
      transaction.items &&
        Array.isArray(transaction.items) &&
        transaction.items.length > 1
        ? transaction.items
        : [],
    );
    const meta =
      typeof transaction.metadata === "string"
        ? JSON.parse(transaction.metadata)
        : transaction.metadata;
    setGrossAmount(meta?.gross_amount || 0);
  }, [transaction]);

  const getCategoryIcon = useCallback(
    (main: string): string =>
      dbCategories.find((c) => c.main === main)?.icon || "📦",
    [dbCategories],
  );

  const openPicker = useCallback((target: PickerTarget) => {
    setPickerTarget(target);
    setPickerOpen(true);
  }, []);

  const handlePickerSelect = useCallback(
    (main: string, sub: string) => {
      if (pickerTarget === "single") {
        setCategoryMain(main);
        setCategorySub(sub);
      } else {
        setItems((prev) => {
          const next = [...prev];
          next[pickerTarget] = {
            ...next[pickerTarget],
            categoryMain: main,
            categorySub: sub,
          };
          return next;
        });
      }
      setPickerOpen(false);
    },
    [pickerTarget],
  );

  const totalItemsAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.amount, 0),
    [items],
  );

  // Current main/sub for picker highlighting
  const pickerCurrent = useMemo(() => {
    if (pickerTarget === "single") {
      return { main: categoryMain, sub: categorySub };
    }
    const item = items[pickerTarget];
    return {
      main: item?.categoryMain || "",
      sub: item?.categorySub || "",
    };
  }, [pickerTarget, categoryMain, categorySub, items]);

  const handleAddItem = useCallback(() => {
    setItems((prev) => [...prev, { ...DEFAULT_EXTRA_ITEM }]);
  }, []);

  const handleConvertToMultiItems = useCallback(() => {
    setItems([
      { categoryMain, categorySub, storeName, amount, memo },
      { ...DEFAULT_EXTRA_ITEM },
    ]);
  }, [categoryMain, categorySub, storeName, amount, memo]);

  const handleRemoveItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleItemFieldChange = useCallback(
    (idx: number, field: keyof ExpenseItem, value: string | number) => {
      setItems((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: value };
        return next;
      });
    },
    [],
  );

  const handleSave = async () => {
    if (!transaction) return;
    setIsSaving(true);

    try {
      const hasItems = items.length > 1;
      const finalAmount = hasItems ? totalItemsAmount : amount;

      const updateData: Record<string, unknown> = {
        date,
        category_main: hasItems ? items[0].categoryMain : categoryMain,
        category_sub: hasItems ? items[0].categorySub : categorySub,
        store_name: hasItems
          ? items[0].storeName || storeName || null
          : storeName || null,
        amount: finalAmount,
        memo: hasItems
          ? items.map((i) => i.memo || i.categorySub).join(", ")
          : memo || null,
        user_type: userType,
      };

      if (hasItems) {
        updateData.items = items.map((item) => ({
          categoryMain: item.categoryMain,
          categorySub: item.categorySub,
          storeName: item.storeName,
          amount: item.amount,
          memo: item.memo,
        }));
      }

      if (transactionType === "income" && grossAmount > 0) {
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

      // Feature #1: カテゴリを変更した場合は category_corrections に学習用履歴を残す。
      // 単一品目 (items.length <= 1) のときだけ記録 (複数品目は修正箇所が特定しづらいためスキップ)。
      if (
        !hasItems &&
        transaction &&
        (transaction.category_main !== categoryMain ||
          transaction.category_sub !== categorySub)
      ) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("category_corrections").insert({
              user_id: user.id,
              user_type: userType,
              store_name: storeName || transaction.store_name || null,
              memo: memo || transaction.memo || null,
              original_category_main: transaction.category_main,
              original_category_sub: transaction.category_sub,
              corrected_category_main: categoryMain,
              corrected_category_sub: categorySub,
              source: "edit_dialog",
            });
          }
        } catch (learnErr) {
          // 学習ログの失敗で本体更新を失敗扱いにはしない
          console.warn("category_corrections insert failed:", learnErr);
        }
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

  const isIncome = transactionType === "income";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border-slate-700"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2 text-base">
            <Save className="h-4 w-4" style={{ color: theme.primary }} />
            {isIncome ? "収入を編集" : "取引を編集"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 個人 / 共同 切替 */}
          <div className="space-y-1">
            <Label className="text-white/70 text-xs">区分</Label>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setUserType(displayName || "自分");
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-all ${
                  userType !== "共同"
                    ? "text-white"
                    : "text-white/40 bg-slate-800/50 hover:bg-slate-800/80"
                }`}
                style={
                  userType !== "共同"
                    ? {
                        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                      }
                    : {}
                }
              >
                <User className="h-3.5 w-3.5" />
                {displayName || "個人"}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setUserType("共同");
                }}
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
                <Label className="text-white/70 text-xs">
                  品目（{items.length}点）
                </Label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                  style={{ color: theme.primary }}
                >
                  <Plus className="h-3 w-3" /> 追加
                </button>
              </div>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">
                        品目 {idx + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
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
                        onChange={(e) =>
                          handleItemFieldChange(idx, "memo", e.target.value)
                        }
                        placeholder="品名"
                        className="bg-slate-900/50 border-slate-700 text-white h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={item.amount || ""}
                        onChange={(e) =>
                          handleItemFieldChange(
                            idx,
                            "amount",
                            Number(e.target.value),
                          )
                        }
                        placeholder="金額"
                        className="bg-slate-900/50 border-slate-700 text-white h-8 text-xs"
                      />
                    </div>
                    {/* カテゴリー選択ボタン */}
                    <button
                      type="button"
                      onClick={() => openPicker(idx)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all text-left"
                    >
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="text-sm">
                          {getCategoryIcon(item.categoryMain)}
                        </span>
                        <span className="font-semibold text-white">
                          {item.categoryMain}
                        </span>
                        <span className="text-white/30">/</span>
                        <span className="text-white/60">
                          {item.categorySub}
                        </span>
                      </span>
                      <span className="text-[10px] text-purple-400 shrink-0">
                        変更 ›
                      </span>
                    </button>
                  </div>
                ))}
                <div ref={itemsEndRef} />
              </div>

              {/* 合計金額プレビュー */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <span className="text-xs text-white/50">合計金額</span>
                <span className="text-lg font-bold text-red-400">
                  -¥{totalItemsAmount.toLocaleString()}
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
                  onClick={handleConvertToMultiItems}
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
                  onClick={() => openPicker("single")}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all text-left"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span>{getCategoryIcon(categoryMain)}</span>
                    <span className="font-semibold text-white">
                      {categoryMain}
                    </span>
                    <span className="text-white/30">/</span>
                    <span className="text-white/60">{categorySub}</span>
                  </span>
                  <span className="text-[10px] text-purple-400 shrink-0">
                    変更 ›
                  </span>
                </button>
              </div>

              {/* 店名 & 金額 */}
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">
                    {isIncome ? "収入源" : "店名"}
                  </Label>
                  <Input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder={isIncome ? "会社名" : "スーパー○○"}
                    className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">
                    {isIncome ? "手取り金額" : "金額"}
                  </Label>
                  <Input
                    type="number"
                    value={amount || ""}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
                  />
                </div>
              </div>

              {/* 収入の場合: 総支給額 */}
              {isIncome && (
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">
                    総支給額（額面）
                  </Label>
                  <Input
                    type="number"
                    value={grossAmount || ""}
                    onChange={(e) => setGrossAmount(Number(e.target.value))}
                    placeholder="320000"
                    className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
                  />
                  {grossAmount > 0 && amount > 0 && (
                    <p className="text-xs text-orange-400">
                      控除額: ¥
                      {(grossAmount - amount).toLocaleString()}（
                      {((1 - amount / grossAmount) * 100).toFixed(1)}%）
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
              }}
              disabled={isSaving || isDeleting}
              className="flex-1 h-10 text-sm font-semibold"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  保存
                </>
              )}
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
              }}
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

        <CategoryPicker
          open={pickerOpen}
          categories={dbCategories}
          currentMain={pickerCurrent.main}
          currentSub={pickerCurrent.sub}
          onSelect={handlePickerSelect}
          onClose={() => setPickerOpen(false)}
          tone="purple"
        />
      </DialogContent>
    </Dialog>
  );
}
