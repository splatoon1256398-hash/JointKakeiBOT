"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getJSTDateString } from "@/lib/date";
import { Plus, Trash2, Calendar, Loader2, CreditCard, Pencil, X, Check } from "lucide-react";
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
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export function FixedExpenses() {
  const { user, selectedUser, theme } = useApp();
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dbCategories, setDbCategories] = useState<{ main: string; icon: string; subs: string[] }[]>([]);

  // カテゴリーピッカー状態
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<'main' | 'sub'>('main');
  const [pickerTempMain, setPickerTempMain] = useState('');

  // DBからカテゴリ取得
  useEffect(() => {
    supabase
      .from("categories")
      .select("main_category, icon, subcategories")
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          setDbCategories(
            data.map((d) => ({
              main: d.main_category,
              icon: d.icon || "📦",
              subs: d.subcategories || ["その他"],
            }))
          );
        }
      });
  }, []);

  const getSubcategoriesFromDB = (mainCat: string): string[] => {
    const found = dbCategories.find((c) => c.main === mainCat);
    return found?.subs || ["その他"];
  };

  const getCategoryIconFromDB = (mainCat: string): string => {
    const found = dbCategories.find((c) => c.main === mainCat);
    return found?.icon || "📦";
  };

  // フォーム状態
  const [categoryMain, setCategoryMain] = useState("");
  const [categorySub, setCategorySub] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDay, setPaymentDay] = useState("");
  const [memo, setMemo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const resetForm = () => {
    setCategoryMain("");
    setCategorySub("");
    setAmount("");
    setPaymentDay("");
    setMemo("");
    setStartDate("");
    setEndDate("");
    setEditingId(null);
    setShowAddForm(false);
  };

  // 固定費の取得
  const fetchExpenses = useCallback(async () => {
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
  }, [user, selectedUser]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // 編集開始（インライン）
  const handleEdit = (expense: FixedExpense) => {
    setEditingId(expense.id);
    setCategoryMain(expense.category_main);
    setCategorySub(expense.category_sub);
    setAmount(String(expense.amount));
    setPaymentDay(String(expense.payment_day));
    setMemo(expense.memo || "");
    setStartDate(expense.start_date || "");
    setEndDate(expense.end_date || "");
    setShowAddForm(false);
  };

  const addFormRef = useRef<HTMLDivElement>(null);

  // 新規追加フォームを開く
  const handleOpenAdd = () => {
    resetForm();
    setShowAddForm(true);
    setTimeout(() => {
      addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  // 固定費の追加 or 更新
  const handleSave = async () => {
    if (!user || !categoryMain || !categorySub || !amount || !paymentDay) return;

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        user_type: selectedUser,
        category_main: categoryMain,
        category_sub: categorySub,
        amount: parseInt(amount),
        payment_day: parseInt(paymentDay),
        memo: memo || null,
        start_date: startDate || null,
        end_date: endDate || null,
        is_active: true,
      };

      if (editingId) {
        const { error } = await supabase
          .from("fixed_expenses")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fixed_expenses").insert(payload);
        if (error) throw error;
      }

      resetForm();
      fetchExpenses();
    } catch (error) {
      console.error("固定費保存エラー:", error);
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

  const monthlyTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  // カテゴリ別内訳
  const categoryBreakdown = (() => {
    const map: Record<string, number> = {};
    expenses.forEach((exp) => {
      map[exp.category_main] = (map[exp.category_main] || 0) + exp.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, icon: getCategoryIconFromDB(name) }))
      .sort((a, b) => b.value - a.value);
  })();

  // 期間表示ヘルパー
  const formatPeriod = (start: string | null, end: string | null) => {
    if (!start && !end) return null;
    const s = start ? start.replace(/-/g, "/") : "";
    const e = end ? end.replace(/-/g, "/") : "無期限";
    if (start && !end) return `${s}〜`;
    if (!start && end) return `〜${e}`;
    return `${s}〜${e}`;
  };

  // 有効かどうか判定
  const isActiveNow = (exp: FixedExpense) => {
    const today = getJSTDateString();
    if (exp.start_date && today < exp.start_date) return false;
    if (exp.end_date && today > exp.end_date) return false;
    return true;
  };

  // ピッカーハンドラー
  const openPicker = (currentMain: string) => {
    setPickerTempMain(currentMain);
    setPickerStep('main');
    setPickerOpen(true);
  };

  const handlePickerSelectSub = (sub: string) => {
    setCategoryMain(pickerTempMain);
    setCategorySub(sub);
    setPickerOpen(false);
  };

  // インライン編集フォーム（カード内に表示）
  const renderInlineForm = (isAdd: boolean) => (
    <div className="rounded-xl p-3 bg-slate-800/50 border space-y-3" style={{ borderColor: `${theme.primary}40` }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-white">
          {isAdd ? "固定費を追加" : "固定費を編集"}
        </p>
        <button onClick={resetForm} className="text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* カテゴリー選択ボタン（ピッカーUI） */}
      <div className="space-y-1">
        <Label className="text-xs text-gray-400">カテゴリー</Label>
        <button
          type="button"
          onClick={() => openPicker(categoryMain)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 transition-all text-left"
        >
          {categoryMain ? (
            <span className="flex items-center gap-2 text-sm">
              <span>{getCategoryIconFromDB(categoryMain)}</span>
              <span className="font-semibold text-white">{categoryMain}</span>
              <span className="text-white/30">/</span>
              <span className="text-white/60">{categorySub || "選択"}</span>
            </span>
          ) : (
            <span className="text-sm text-white/40">カテゴリーを選択</span>
          )}
          <span className="text-[10px] text-purple-400 shrink-0">変更 ›</span>
        </button>
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

      {/* 適用期間 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">開始日（任意）</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-400">終了日（無期限可）</Label>
          <div className="relative">
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white h-9 pr-8"
            />
            {endDate && (
              <button
                onClick={() => setEndDate("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!endDate && (
            <p className="text-[10px] text-gray-500 mt-0.5">未設定 = 無期限</p>
          )}
        </div>
      </div>

      {/* ボタン */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="ghost"
          onClick={resetForm}
          className="flex-1 text-gray-400 hover:text-white"
        >
          キャンセル
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !categoryMain || !categorySub || !amount || !paymentDay}
          className="flex-1 text-white"
          style={{ background: theme.primary }}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : editingId ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              更新
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              追加
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
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
          onClick={handleOpenAdd}
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
        style={{
          background: `${theme.primary}15`,
          border: `1px solid ${theme.primary}40`,
        }}
      >
        <p className="text-xs text-gray-400">毎月の固定費合計</p>
        <p className="text-2xl font-bold text-white">
          ¥{monthlyTotal.toLocaleString()}
        </p>

        {/* カテゴリ別内訳 */}
        {categoryBreakdown.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">カテゴリ別内訳</p>
            {categoryBreakdown.map((cat) => {
              const pct = monthlyTotal > 0 ? (cat.value / monthlyTotal * 100) : 0;
              return (
                <div key={cat.name} className="flex items-center gap-2">
                  <span className="text-sm flex-shrink-0">{cat.icon}</span>
                  <span className="text-xs text-white/70 flex-1 min-w-0 truncate">{cat.name}</span>
                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden flex-shrink-0">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: theme.primary }}
                    />
                  </div>
                  <span className="text-xs text-white font-semibold tabular-nums flex-shrink-0">
                    ¥{cat.value.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新規追加フォーム */}
      <div ref={addFormRef}>
        {showAddForm && renderInlineForm(true)}
      </div>

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
          {expenses.map((expense) => {
            const active = isActiveNow(expense);
            const period = formatPeriod(expense.start_date, expense.end_date);
            const isEditing = editingId === expense.id;

            // インライン編集モード
            if (isEditing) {
              return (
                <div key={expense.id}>
                  {renderInlineForm(false)}
                </div>
              );
            }

            // 通常表示モード
            return (
              <div
                key={expense.id}
                className={`p-3 rounded-xl bg-slate-800/50 border border-slate-700 ${
                  !active ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: `${theme.primary}20` }}
                    >
                      {getCategoryIconFromDB(expense.category_main)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {expense.memo || expense.category_sub}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
                        <span className="truncate">
                          {expense.category_main} / {expense.category_sub}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" />
                          毎月{expense.payment_day}日
                        </span>
                      </div>
                      {period && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          📅 {period}
                          {!active && (
                            <span className="ml-1 text-orange-400">（期間外）</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <p className="text-base font-bold text-white mr-1">
                      ¥{expense.amount.toLocaleString()}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(expense)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-blue-400"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
              </div>
            );
          })}
        </div>
      )}

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
                    const isSelected = categoryMain === cat.main;
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
                    const isSelected = categoryMain === pickerTempMain && categorySub === sub;
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
    </div>
  );
}
