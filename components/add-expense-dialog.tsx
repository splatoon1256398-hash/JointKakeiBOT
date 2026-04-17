"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Camera,
  Loader2,
  Sparkles,
  Plus,
  Calendar,
} from "lucide-react";
import { getJSTDateString } from "@/lib/date";
import { type ExpenseItem, type ReceiptAnalysisResult } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";
import { useScanUpload } from "@/lib/hooks/use-scan-upload";
import { runBudgetAlertCheck } from "@/lib/hooks/use-budget-alerts";
import { ScanningOverlay } from "@/components/scan/scanning-overlay";
import { SuccessOverlay } from "@/components/scan/success-overlay";
import { ScanButtons } from "@/components/scan/scan-buttons";
import { CapturedPreview } from "@/components/scan/captured-preview";
import { CategoryPicker } from "@/components/scan/category-picker";
import { ExpenseItemRow } from "@/components/expense/expense-item-row";

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: string;
}

const DEFAULT_ITEM: ExpenseItem = {
  categoryMain: "食費",
  categorySub: "食料品",
  storeName: "",
  amount: 0,
  memo: "",
};

export function AddExpenseDialog({
  open,
  onOpenChange,
  selectedUser,
}: AddExpenseDialogProps) {
  const {
    triggerRefresh,
    categories: dbCategories,
    getCategoryIcon,
    getSubcategories,
  } = useApp();
  const { assets: charAssets, isActive: charActive } = useCharacter();

  const [isSaving, setIsSaving] = useState(false);
  const [continuousScan, setContinuousScan] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [date, setDate] = useState(getJSTDateString());
  const [items, setItems] = useState<ExpenseItem[]>([{ ...DEFAULT_ITEM }]);

  // Category picker state — which item index is being edited
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItemIndex, setPickerItemIndex] = useState(0);

  // Keep the latest categories accessible inside async callbacks (the
  // scan result arrives asynchronously after the user may have navigated).
  const dbCategoriesRef = useRef(dbCategories);
  useEffect(() => {
    dbCategoriesRef.current = dbCategories;
  }, [dbCategories]);

  const handleScanResult = useCallback((result: ReceiptAnalysisResult) => {
    if (result.date) setDate(result.date);
    if (!result.items || result.items.length === 0) return;

    const cats = dbCategoriesRef.current;
    setItems(
      result.items.map((item) => {
        const main = item.categoryMain || "その他";
        const catEntry = cats.find((c) => c.main === main);
        const validMain = catEntry ? main : cats[0]?.main || "その他";
        const validSubs =
          cats.find((c) => c.main === validMain)?.subs || ["その他"];
        const sub =
          item.categorySub && validSubs.includes(item.categorySub)
            ? item.categorySub
            : validSubs[0] || "その他";
        return {
          categoryMain: validMain,
          categorySub: sub,
          storeName: item.storeName || "",
          amount: item.amount || 0,
          memo: item.memo || "",
        };
      }),
    );
  }, []);

  const scan = useScanUpload<ReceiptAnalysisResult>({
    endpoint: "/api/receipt",
    perfLabel: "receipt",
    label: "レシート",
    onSuccess: handleScanResult,
  });

  // Scroll to the newly-added item when the list grows
  const itemsEndRef = useRef<HTMLDivElement>(null);
  const prevItemsLengthRef = useRef(0);
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

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { ...DEFAULT_ITEM }]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }, []);

  const updateItem = useCallback(
    (index: number, field: keyof ExpenseItem, value: string | number) => {
      setItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        if (field === "categoryMain") {
          const subs = getSubcategories(value as string);
          next[index].categorySub = subs[0];
        }
        return next;
      });
    },
    [getSubcategories],
  );

  const openPickerFor = useCallback((index: number) => {
    setPickerItemIndex(index);
    setPickerOpen(true);
  }, []);

  const handlePickerSelect = useCallback((main: string, sub: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[pickerItemIndex] = {
        ...next[pickerItemIndex],
        categoryMain: main,
        categorySub: sub,
      };
      return next;
    });
    setPickerOpen(false);
  }, [pickerItemIndex]);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [items],
  );

  const resetForm = useCallback(() => {
    setDate(getJSTDateString());
    setItems([{ ...DEFAULT_ITEM }]);
    scan.clearCaptured();
  }, [scan]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
      setContinuousScan(false);
      setScanCount(0);
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || "";

      let insertedTxId: string | null = null;

      if (items.length > 1) {
        const { data: inserted, error } = await supabase
          .from("transactions")
          .insert({
            user_id: user?.id,
            user_type: selectedUser,
            type: "expense",
            date,
            category_main: items[0].categoryMain,
            category_sub: items[0].categorySub,
            store_name: items[0].storeName,
            amount: totalAmount,
            memo: items.map((i) => i.memo || i.categorySub).join(", "),
            items: items.map((item) => ({
              categoryMain: item.categoryMain,
              categorySub: item.categorySub,
              storeName: item.storeName,
              amount: item.amount,
              memo: item.memo,
            })),
          })
          .select("id")
          .single();

        if (error) {
          console.error("Supabase保存エラー:", error);
          alert(`保存に失敗しました: ${error.message}`);
          return;
        }
        insertedTxId = inserted?.id || null;
      } else {
        const item = items[0];
        const { data: inserted, error } = await supabase
          .from("transactions")
          .insert({
            user_id: user?.id,
            user_type: selectedUser,
            type: "expense",
            date,
            category_main: item.categoryMain,
            category_sub: item.categorySub,
            store_name: item.storeName,
            amount: item.amount,
            memo: item.memo,
          })
          .select("id")
          .single();

        if (error) {
          console.error("Supabase保存エラー:", error);
          alert(`保存に失敗しました: ${error.message}`);
          return;
        }
        insertedTxId = inserted?.id || null;
      }

      alert("支出を追加しました！");

      // Push partner for joint expenses (fire-and-forget)
      if (selectedUser === "共同") {
        try {
          await fetch("/api/push/joint-expense", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ transactionId: insertedTxId }),
          });
        } catch (pushError) {
          console.error("Push通知送信エラー:", pushError);
        }
      }

      // Budget alerts (fire-and-forget, swallows errors internally)
      void runBudgetAlertCheck({
        userId: user?.id || "",
        userType: selectedUser,
        savedItems: items,
        accessToken,
      });

      triggerRefresh();

      if (continuousScan) {
        setScanCount((prev) => prev + 1);
        resetForm();
        setTimeout(() => scan.openCamera(), 500);
        return;
      }

      resetForm();

      if (charActive && charAssets) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          onOpenChange(false);
        }, 1800);
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      console.error("保存エラー:", error);
      alert("保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const currentPickerItem = items[pickerItemIndex];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {charActive && charAssets ? (
              <CharacterImage
                src={charAssets.avatar}
                alt=""
                width={20}
                height={20}
                className="object-contain"
                fallback={<Sparkles className="h-4 w-4 text-purple-600" />}
              />
            ) : (
              <Sparkles className="h-4 w-4 text-purple-600" />
            )}
            支出を追加 - {selectedUser}
          </DialogTitle>
          <DialogDescription className="text-xs">
            レシートをカメラで撮影すると、AIが自動で複数の項目に分類します
          </DialogDescription>
        </DialogHeader>

        <ScanningOverlay
          open={scan.isAnalyzing}
          title={
            scan.stage === "uploading"
              ? "画像をアップロード中..."
              : "レシートを解析中..."
          }
          subtitle={
            scan.stage === "uploading"
              ? "しばらくお待ちください"
              : "AIが項目を分類しています"
          }
          tone="purple"
        />

        <SuccessOverlay open={showSuccess} />

        {currentPickerItem && (
          <CategoryPicker
            open={pickerOpen}
            categories={dbCategories}
            currentMain={currentPickerItem.categoryMain}
            currentSub={currentPickerItem.categorySub}
            onSelect={handlePickerSelect}
            onClose={() => setPickerOpen(false)}
            tone="purple"
            mainTitle="カテゴリーを選択"
            mainColumns={3}
          />
        )}

        <div className="space-y-4">
          {!scan.capturedImage && (
            <ScanButtons
              cameraInputRef={scan.cameraInputRef}
              fileInputRef={scan.fileInputRef}
              onCameraChange={scan.onCameraChange}
              onFileChange={scan.onFileChange}
              variant="expense"
            />
          )}

          {scan.capturedImage && (
            <CapturedPreview
              src={scan.capturedImage}
              isPdf={scan.isPdf}
              onClear={scan.clearCaptured}
              variant="expense"
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border">
              <Calendar className="h-4 w-4 text-purple-600" />
              <Label htmlFor="date" className="text-sm font-semibold">
                日付
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="max-w-xs h-8 text-sm"
              />
            </div>

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
                <ExpenseItemRow
                  key={index}
                  item={item}
                  index={index}
                  icon={getCategoryIcon(item.categoryMain)}
                  onChange={(field, value) => updateItem(index, field, value)}
                  onOpenPicker={() => openPickerFor(index)}
                  onRemove={() => removeItem(index)}
                  removable={items.length > 1}
                />
              ))}
              <div ref={itemsEndRef} />
            </div>

            <div className="p-2 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">合計金額</span>
                <span className="text-xl font-bold text-green-600">
                  ¥{totalAmount.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setContinuousScan(!continuousScan)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all text-xs ${
                  continuousScan
                    ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                    : "bg-white/5 border-white/10 text-white/50"
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
                <div
                  className={`w-8 h-4 rounded-full transition-colors flex items-center ${
                    continuousScan
                      ? "bg-purple-500 justify-end"
                      : "bg-white/20 justify-start"
                  }`}
                >
                  <div className="w-3 h-3 rounded-full bg-white mx-0.5" />
                </div>
              </button>
              {continuousScan && (
                <p className="text-[10px] text-purple-300/60 px-1">
                  保存後、自動的にカメラが起動して次のレシートをスキャンできます
                </p>
              )}

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
                  {continuousScan && scanCount > 0 ? "完了" : "キャンセル"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
