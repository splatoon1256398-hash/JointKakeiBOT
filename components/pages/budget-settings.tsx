"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Save, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface Budget {
  id: string;
  category_main: string;
  monthly_budget: number;
}

interface CategoryWithBudget {
  main_category: string;
  icon: string;
  current_budget: number;
}

export function BudgetSettings() {
  const { selectedUser, user } = useApp();
  const [categories, setCategories] = useState<CategoryWithBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // カテゴリー一覧を取得
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('main_category, icon')
        .order('sort_order');

      // 既存の予算を取得
      const { data: budgetsData } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_type', selectedUser);

      // カテゴリーと予算をマージ
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
      // 各カテゴリーの予算を保存（UPSERT）
      const budgetsToSave = Object.entries(budgets).map(([category, amount]) => ({
        user_id: user?.id,
        user_type: selectedUser,
        category_main: category,
        monthly_budget: amount,
      }));

      for (const budget of budgetsToSave) {
        // 既存レコードを確認
        const { data: existing } = await supabase
          .from('budgets')
          .select('id')
          .eq('user_type', selectedUser)
          .eq('category_main', budget.category_main)
          .single();

        if (existing) {
          // 更新
          await supabase
            .from('budgets')
            .update({ monthly_budget: budget.monthly_budget })
            .eq('id', existing.id);
        } else {
          // 新規作成
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

  return (
    <div className="space-y-6">
      <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-purple-600" />
            月間予算設定 - {selectedUser}
          </CardTitle>
          <CardDescription>
            各カテゴリーの月間予算を設定します
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {categories.map((category) => (
                <div
                  key={category.main_category}
                  className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-white/80 to-gray-50/80 dark:from-slate-800/80 dark:to-slate-900/80 border border-gray-200/50 dark:border-gray-700/50"
                >
                  <span className="text-3xl">{category.icon}</span>
                  <div className="flex-1">
                    <Label className="text-sm font-semibold">{category.main_category}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">¥</span>
                    <Input
                      type="number"
                      value={budgets[category.main_category] || ''}
                      onChange={(e) => handleBudgetChange(category.main_category, e.target.value)}
                      placeholder="0"
                      className="w-32 text-right"
                    />
                  </div>
                </div>
              ))}

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      予算を保存
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
