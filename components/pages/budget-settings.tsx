"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Wallet, Save, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface CategoryWithBudget {
  main_category: string;
  icon: string;
  current_budget: number;
}

export function BudgetSettings() {
  const { selectedUser, user, theme } = useApp();
  const [categories, setCategories] = useState<CategoryWithBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('main_category, icon')
        .order('sort_order');

      const { data: budgetsData } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_type', selectedUser);

      const budgetMap: Record<string, number> = {};
      budgetsData?.forEach(b => {
        budgetMap[b.category_main] = b.monthly_budget;
      });

      const merged = categoriesData?.map(cat => ({
        main_category: cat.main_category,
        icon: cat.icon,
        current_budget: budgetMap[cat.main_category] || 0,
      })) || [];

      setCategories(merged);
      setBudgets(budgetMap);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedUser]);

  const handleBudgetChange = (category: string, value: string) => {
    setBudgets(prev => ({
      ...prev,
      [category]: Number(value) || 0,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const budgetsToSave = Object.entries(budgets).map(([category, amount]) => ({
        user_id: user?.id,
        user_type: selectedUser,
        category_main: category,
        monthly_budget: amount,
      }));

      for (const budget of budgetsToSave) {
        const { data: existing } = await supabase
          .from('budgets')
          .select('id')
          .eq('user_type', selectedUser)
          .eq('category_main', budget.category_main)
          .single();

        if (existing) {
          await supabase
            .from('budgets')
            .update({ monthly_budget: budget.monthly_budget })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('budgets')
            .insert(budget);
        }
      }

      alert('予算を保存しました！');
      await fetchData();
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const totalBudget = Object.values(budgets).reduce((sum, v) => sum + v, 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Wallet className="h-5 w-5" style={{ color: theme.primary }} />
          月間予算設定 - {selectedUser}
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          各カテゴリーの月間予算を設定します
        </p>
      </div>

      {/* 合計バー */}
      <div className="rounded-xl p-3" style={{ background: `${theme.primary}15`, border: `1px solid ${theme.primary}40` }}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/70">月間予算合計</span>
          <span className="text-xl font-bold text-white">¥{totalBudget.toLocaleString()}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category.main_category}
              className="flex items-center gap-3 p-3 rounded-xl bg-black/15 border border-white/5"
            >
              <span className="text-2xl flex-shrink-0">{category.icon}</span>
              <span className="text-sm font-semibold text-white flex-1 min-w-0 truncate">
                {category.main_category}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-white/40">¥</span>
                <Input
                  type="number"
                  value={budgets[category.main_category] || ''}
                  onChange={(e) => handleBudgetChange(category.main_category, e.target.value)}
                  placeholder="0"
                  className="w-24 h-8 text-right text-sm bg-black/20 border-white/10 text-white placeholder:text-white/20"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full p-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
      >
        {isSaving ? (
          <><Loader2 className="h-4 w-4 animate-spin" />保存中...</>
        ) : (
          <><Save className="h-4 w-4" />予算を保存</>
        )}
      </button>
    </div>
  );
}
