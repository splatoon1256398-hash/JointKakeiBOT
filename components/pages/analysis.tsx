"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CategoryDetailDialog } from "@/components/category-detail-dialog";

interface Transaction {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name: string;
  amount: number;
  memo: string;
  type: string;
}

const CHART_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#f97316'];

export function Analysis() {
  const { selectedUser, refreshTrigger, theme } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [yearlyData, setYearlyData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>({});
  const [subCategoryData, setSubCategoryData] = useState<Record<string, any[]>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<{ name: string; icon: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, [selectedUser]);

  // refreshTriggerの変更を監視して自動更新
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData();
    }
  }, [refreshTrigger]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // カテゴリーアイコンを取得
      const { data: categories } = await supabase
        .from('categories')
        .select('main_category, icon, subcategories');
      
      const icons: Record<string, string> = {};
      const subCats: Record<string, string[]> = {};
      categories?.forEach(cat => {
        icons[cat.main_category] = cat.icon;
        subCats[cat.main_category] = cat.subcategories;
      });
      setCategoryIcons(icons);

      // 過去12ヶ月のデータを取得
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_type', selectedUser)
        .gte('date', twelveMonthsAgo.toISOString().split('T')[0])
        .order('date', { ascending: true });

      setTransactions(transactionsData || []);

      // 月別収支データを作成
      const monthlyMap: Record<string, { income: number; expense: number }> = {};
      transactionsData?.forEach(t => {
        const month = t.date.substring(0, 7); // YYYY-MM
        if (!monthlyMap[month]) {
          monthlyMap[month] = { income: 0, expense: 0 };
        }
        if (t.type === 'income') {
          monthlyMap[month].income += t.amount;
        } else {
          monthlyMap[month].expense += t.amount;
        }
      });

      const yearly = Object.entries(monthlyMap).map(([month, data]) => ({
        month: month.substring(5) + '月', // MM月
        収入: data.income,
        支出: data.expense,
        収支: data.income - data.expense,
      }));
      setYearlyData(yearly);

      // カテゴリー別支出データを作成（今月）
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const categoryMap: Record<string, number> = {};
      transactionsData
        ?.filter(t => t.type === 'expense' && t.date >= firstDay.toISOString().split('T')[0])
        .forEach(t => {
          categoryMap[t.category_main] = (categoryMap[t.category_main] || 0) + t.amount;
        });

      const categoryArray = Object.entries(categoryMap).map(([name, value]) => ({
        name,
        value,
        icon: icons[name] || '📦',
      }));
      setCategoryData(categoryArray);

      // 小カテゴリー別データを準備
      const subCatMap: Record<string, Record<string, number>> = {};
      transactionsData
        ?.filter(t => t.type === 'expense' && t.date >= firstDay.toISOString().split('T')[0])
        .forEach(t => {
          if (!subCatMap[t.category_main]) {
            subCatMap[t.category_main] = {};
          }
          subCatMap[t.category_main][t.category_sub] = 
            (subCatMap[t.category_main][t.category_sub] || 0) + t.amount;
        });

      const subCatData: Record<string, any[]> = {};
      Object.entries(subCatMap).forEach(([mainCat, subs]) => {
        subCatData[mainCat] = Object.entries(subs).map(([name, value]) => ({
          name,
          value,
        }));
      });
      setSubCategoryData(subCatData);

    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 指定した大カテゴリーの明細を取得
  const getTransactionsByCategory = (mainCategory: string) => {
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return transactions.filter(
      t => t.type === 'expense' && 
           t.category_main === mainCategory &&
           t.date >= firstDay.toISOString().split('T')[0]
    );
  };

  // カテゴリーをタップしたときの処理
  const handleCategoryClick = (categoryName: string, categoryIcon: string) => {
    setSelectedCategory({ name: categoryName, icon: categoryIcon });
    setDetailDialogOpen(true);
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-700/50 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : (
        <>
          {/* 支出ドーナツグラフ */}
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 shadow-xl">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-400" />
                今月の支出内訳
              </h3>
              <div className="flex items-center gap-4">
                {/* 左側：凡例 */}
                <div className="flex-1 space-y-2">
                  {categoryData.slice(0, 6).map((cat, index) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-sm" 
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate">{cat.icon} {cat.name}</p>
                        <p className="text-xs text-red-400 font-semibold">¥{cat.value.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* 右側：円グラフ */}
                <div className="w-40 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value: number) => `¥${value.toLocaleString()}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* カテゴリー別リスト（ドリルダウン） */}
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 shadow-xl">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-purple-400" />
                カテゴリー詳細
              </h3>
              <div className="space-y-2">
                {categoryData.map((cat) => (
                  <div
                    key={cat.name}
                    onClick={() => handleCategoryClick(cat.name, cat.icon)}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 hover:bg-slate-900/70 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="font-semibold text-white">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-red-400">¥{cat.value.toLocaleString()}</span>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 年間支出推移グラフ（支出のみ） */}
          <Card className="bg-slate-800/50 backdrop-blur-xl border-slate-700/50 shadow-xl">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                年間支出推移
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9ca3af" style={{ fontSize: '11px' }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: '11px' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="支出" fill="#ef4444" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* カテゴリー詳細ダイアログ */}
      {selectedCategory && (
        <CategoryDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          categoryName={selectedCategory.name}
          categoryIcon={selectedCategory.icon}
          subCategoryData={subCategoryData[selectedCategory.name] || []}
          transactions={getTransactionsByCategory(selectedCategory.name)}
        />
      )}
    </div>
  );
}
