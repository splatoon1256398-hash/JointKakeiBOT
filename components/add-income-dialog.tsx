"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Loader2, Sparkles } from "lucide-react";
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
  const [isSaving, setIsSaving] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryMain, setCategoryMain] = useState("給与・賞与");
  const [categorySub, setCategorySub] = useState("給与");
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [memo, setMemo] = useState("");

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
    setMemo("");
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
            収入を記録します
          </DialogDescription>
        </DialogHeader>

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

          {/* 金額 */}
          <div className="space-y-1">
            <Label className="text-xs text-white">金額 *</Label>
            <Input
              type="number"
              placeholder="250000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="h-10 text-lg bg-slate-800/50 border-slate-700 text-white font-bold"
            />
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
            <div className="p-2 rounded-lg bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-700/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">収入金額</span>
                <span className="text-2xl font-bold text-green-400">
                  +¥{Number(amount).toLocaleString()}
                </span>
              </div>
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
