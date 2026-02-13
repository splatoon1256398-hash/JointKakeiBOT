"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Calendar, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
// DBからカテゴリを取得するので lib/constants は不要

interface FixedExpense {
  id: string;
  user_id: string;
  user_type: string;
  category_main: string;
  category_sub: string;
  amount: number;
  payment_day: number;
  memo: string | null;
  is_active: boolean;
  created_at: string;
}

export function FixedExpenses() {
  const { user, selectedUser, theme } = useApp();
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [dbCategories, setDbCategories] = useState<{ main: string; icon: string; subs: string[] }[]>([]);

  // DBからカテゴリ取得
  useEffect(() => {
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
  }, []);

  const getSubcategoriesFromDB = (mainCat: string): string[] => {
    const found = dbCategories.find(c => c.main === mainCat);
    return found?.subs || ["その他"];
  };

  // 新規固定費フォーム
  const [categoryMain, setCategoryMain] = useState("");
  const [categorySub, setCategorySub] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDay, setPaymentDay] = useState("");
  const [memo, setMemo] = useState("");

  // 固定費の取得
  const fetchExpenses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fixed_expenses")
        .select("*")
        .eq("user_type", selectedUser)
        .eq("is_active", true)
        .order("payment_day", { ascending: true });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error("固定費取得エラー:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [user, selectedUser]);

  // 固定費の追加
  const handleAdd = async () => {
    if (!user || !categoryMain || !categorySub || !amount || !paymentDay) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("fixed_expenses").insert({
        user_id: user.id,
        user_type: selectedUser,
        category_main: categoryMain,
        category_sub: categorySub,
        amount: parseInt(amount),
        payment_day: parseInt(paymentDay),
        memo: memo || null,
        is_active: true,
      });

      if (error) throw error;

      // フォームリセット
      setCategoryMain("");
      setCategorySub("");
      setAmount("");
      setPaymentDay("");
      setMemo("");
      setShowForm(false);
      fetchExpenses();
    } catch (error) {
      console.error("固定費追加エラー:", error);
    } finally {
      setSaving(false);
    }
  };

  // 固定費の削除（論理削除）
  const handleDelete = async (id: string) => {
    if (!confirm("この固定費を削除しますか？")) return;

    try {
      const { error } = await supabase
        .from("fixed_expenses")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
      fetchExpenses();
    } catch (error) {
      console.error("固定費削除エラー:", error);
    }
  };

  // 小カテゴリーの選択肢を取得
  const subCategories = categoryMain ? getSubcategoriesFromDB(categoryMain) : [];

  // 月間合計を計算
  const monthlyTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5" style={{ color: theme.primary }} />
            固定費設定
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedUser} の固定費（毎月自動で家計簿に反映）
          </p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className="text-white"
          style={{ background: theme.primary }}
        >
          <Plus className="h-4 w-4 mr-1" />
          追加
        </Button>
      </div>

      {/* 月間合計 */}
      <div 
        className="rounded-xl p-3"
        style={{ background: `${theme.primary}15`, border: `1px solid ${theme.primary}40` }}
      >
        <p className="text-xs text-gray-400">毎月の固定費合計</p>
        <p className="text-2xl font-bold text-white">
          ¥{monthlyTotal.toLocaleString()}
        </p>
      </div>

      {/* 新規追加フォーム */}
      {showForm && (
        <div className="rounded-xl p-4 bg-slate-800/50 border border-slate-700 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* 大カテゴリー */}
            <div>
              <Label className="text-xs text-gray-400">大カテゴリー</Label>
              <Select value={categoryMain} onValueChange={(v) => { setCategoryMain(v); setCategorySub(""); }}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {dbCategories.map((cat) => (
                    <SelectItem key={cat.main} value={cat.main} className="text-white">
                      {cat.icon} {cat.main}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 小カテゴリー */}
            <div>
              <Label className="text-xs text-gray-400">小カテゴリー</Label>
              <Select value={categorySub} onValueChange={setCategorySub} disabled={!categoryMain}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {subCategories.map((sub) => (
                    <SelectItem key={sub} value={sub} className="text-white">
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 金額 */}
            <div>
              <Label className="text-xs text-gray-400">金額</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                className="bg-slate-700 border-slate-600 text-white h-9"
              />
            </div>

            {/* 引き落とし日 */}
            <div>
              <Label className="text-xs text-gray-400">引き落とし日</Label>
              <Select value={paymentDay} onValueChange={setPaymentDay}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9">
                  <SelectValue placeholder="日付" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-48">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={String(day)} className="text-white">
                      毎月{day}日
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* メモ */}
          <div>
            <Label className="text-xs text-gray-400">メモ（任意）</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="例: 家賃、光熱費など"
              className="bg-slate-700 border-slate-600 text-white h-9"
            />
          </div>

          {/* ボタン */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              className="flex-1 text-gray-400 hover:text-white"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !categoryMain || !categorySub || !amount || !paymentDay}
              className="flex-1 text-white"
              style={{ background: theme.primary }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "追加"}
            </Button>
          </div>
        </div>
      )}

      {/* 固定費リスト */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-600" />
          <p className="text-sm">固定費が登録されていません</p>
          <p className="text-xs mt-1">「追加」ボタンから登録してください</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: `${theme.primary}20` }}
                >
                  {dbCategories.find(c => c.main === expense.category_main)?.icon || '📦'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {expense.memo || expense.category_sub}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{expense.category_main} / {expense.category_sub}</span>
                    <span>·</span>
                    <Calendar className="h-3 w-3" />
                    <span>毎月{expense.payment_day}日</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold text-white">
                  ¥{expense.amount.toLocaleString()}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(expense.id)}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
