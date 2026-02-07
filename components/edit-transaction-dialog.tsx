"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2 } from "lucide-react";
import { CATEGORY_LIST, getCategoryIcon, getSubcategories } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

export interface TransactionForEdit {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name?: string | null;
  amount: number;
  memo?: string | null;
  user_type: string;
}

interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionForEdit | null;
}

export function EditTransactionDialog({ open, onOpenChange, transaction }: EditTransactionDialogProps) {
  const { triggerRefresh, theme } = useApp();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [date, setDate] = useState("");
  const [categoryMain, setCategoryMain] = useState("");
  const [categorySub, setCategorySub] = useState("");
  const [storeName, setStoreName] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [memo, setMemo] = useState("");

  // transaction が変わったら初期値をセット
  useEffect(() => {
    if (transaction) {
      setDate(transaction.date);
      setCategoryMain(transaction.category_main);
      setCategorySub(transaction.category_sub);
      setStoreName(transaction.store_name || "");
      setAmount(transaction.amount);
      setMemo(transaction.memo || "");
    }
  }, [transaction]);

  const handleCategoryMainChange = (value: string) => {
    setCategoryMain(value);
    const subs = getSubcategories(value);
    setCategorySub(subs[0] || "");
  };

  const handleSave = async () => {
    if (!transaction) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("transactions")
        .update({
          date,
          category_main: categoryMain,
          category_sub: categorySub,
          store_name: storeName || null,
          amount,
          memo: memo || null,
        })
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2 text-base">
            <Save className="h-4 w-4" style={{ color: theme.primary }} />
            取引を編集
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 日付 */}
          <div className="space-y-1">
            <Label className="text-white/70 text-xs">日付</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
            />
          </div>

          {/* カテゴリー */}
          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-1">
              <Label className="text-white/70 text-xs">カテゴリー（大）</Label>
              <Select value={categoryMain} onValueChange={handleCategoryMainChange}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_LIST.map((cat) => (
                    <SelectItem key={cat.main} value={cat.main}>
                      {cat.icon} {cat.main}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-white/70 text-xs">カテゴリー（小）</Label>
              <Select value={categorySub} onValueChange={setCategorySub}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getSubcategories(categoryMain).map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 店名 & 金額 */}
          <div className="grid gap-3 grid-cols-2">
            <div className="space-y-1">
              <Label className="text-white/70 text-xs">店名</Label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="スーパー○○"
                className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70 text-xs">金額</Label>
              <Input
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="bg-slate-800/50 border-slate-700 text-white h-9 text-sm"
              />
            </div>
          </div>

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

          {/* ボタン */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
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
              onClick={handleDelete}
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
      </DialogContent>
    </Dialog>
  );
}
