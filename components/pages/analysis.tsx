"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ExpenseCard } from "@/components/widgets/expense-card";
import { EditTransactionDialog, TransactionForEdit } from "@/components/edit-transaction-dialog";
import { type TransactionItem } from "@/lib/gemini";

interface Transaction {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name: string;
  amount: number;
  memo: string;
  type: string;
  items?: TransactionItem[] | null;
}

interface CategoryDataItem {
  name: string;
  value: number;
  icon: string;
}

interface SubCategoryDataItem {
  name: string;
  value: number;
}

interface YearlyDataItem {
  month: string;
  支出: number;
  fullMonth: string;
}

type DrillLevel = 'overview' | 'subcategory' | 'detail';

const CHART_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#f97316'];

export function Analysis() {
  const { selectedUser, refreshTrigger, theme } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [yearlyData, setYearlyData] = useState<YearlyDataItem[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryDataItem[]>([]);
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>({});
  const [subCategoryData, setSubCategoryData] = useState<Record<string, SubCategoryDataItem[]>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // 月選択
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // ドリルダウン状態
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('overview');
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>('');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
  const [editingTransaction, setEditingTransaction] = useState<TransactionForEdit | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // 月の移動ヘルパー
  const goToPrevMonth = useCallback(() => {
    setSelectedMonth(prev => {
      if (prev === 1) {
        setSelectedYear(y => y - 1);
        return 12;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth(prev => {
      if (prev === 12) {
        setSelectedYear(y => y + 1);
        return 1;
      }
      return prev + 1;
    });
  }, []);

  const goToPrevYear = useCallback(() => {
    setSelectedYear(y => y - 1);
  }, []);

  const goToNextYear = useCallback(() => {
    setSelectedYear(y => y + 1);
  }, []);

  const goToCurrentMonth = useCallback(() => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
  }, []);

  const isCurrentMonth = selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth() + 1;

  useEffect(() => {
    fetchData();
  }, [selectedUser, selectedYear, selectedMonth]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData();
    }
  }, [refreshTrigger]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: categories } = await supabase
        .from('categories')
        .select('main_category, icon, subcategories');
      
      const icons: Record<string, string> = {};
      categories?.forEach(cat => {
        icons[cat.main_category] = cat.icon;
      });
      setCategoryIcons(icons);

      // 選択月の範囲（toISOStringはUTC変換でずれるので直接文字列を構築）
      const lastDay = new Date(selectedYear, selectedMonth, 0); // 正確な末日
      const mm = String(selectedMonth).padStart(2, '0');
      const firstDayStr = `${selectedYear}-${mm}-01`;
      const lastDayStr = `${selectedYear}-${mm}-${String(lastDay.getDate()).padStart(2, '0')}`;

      // 年間推移用: 選択月を含む過去12ヶ月
      const prevYear = selectedMonth <= 12 ? selectedYear - 1 : selectedYear;
      const prevMonth = ((selectedMonth - 12 - 1 + 12) % 12) + 1;
      const twelveMonthsAgoStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;

      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_type', selectedUser)
        .gte('date', twelveMonthsAgoStr)
        .lte('date', lastDayStr)
        .order('date', { ascending: true });

      setTransactions(transactionsData || []);

      // 月別データ（年間推移）
      const monthlyMap: Record<string, { income: number; expense: number }> = {};
      transactionsData?.forEach(t => {
        const month = t.date.substring(0, 7);
        if (!monthlyMap[month]) {
          monthlyMap[month] = { income: 0, expense: 0 };
        }
        if (t.type === 'income') {
          monthlyMap[month].income += t.amount;
        } else {
          monthlyMap[month].expense += t.amount;
        }
      });

      const yearly = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month: month.substring(5) + '月',
          支出: data.expense,
          fullMonth: month,
        }));
      setYearlyData(yearly);

      // カテゴリー別支出（選択月）- items対応
      const categoryMap: Record<string, number> = {};
      transactionsData
        ?.filter(t => t.type === 'expense' && t.date >= firstDayStr && t.date <= lastDayStr)
        .forEach(t => {
          if (t.items && Array.isArray(t.items) && t.items.length > 0) {
            (t.items as TransactionItem[]).forEach(item => {
              categoryMap[item.categoryMain] = (categoryMap[item.categoryMain] || 0) + item.amount;
            });
          } else {
            categoryMap[t.category_main] = (categoryMap[t.category_main] || 0) + t.amount;
          }
        });

      const categoryArray = Object.entries(categoryMap)
        .map(([name, value]) => ({ name, value, icon: icons[name] || '📦' }))
        .sort((a, b) => b.value - a.value);
      setCategoryData(categoryArray);

      // 小カテゴリー別データ（選択月）- items対応
      const subCatMap: Record<string, Record<string, number>> = {};
      transactionsData
        ?.filter(t => t.type === 'expense' && t.date >= firstDayStr && t.date <= lastDayStr)
        .forEach(t => {
          if (t.items && Array.isArray(t.items) && t.items.length > 0) {
            (t.items as TransactionItem[]).forEach(item => {
              if (!subCatMap[item.categoryMain]) {
                subCatMap[item.categoryMain] = {};
              }
              subCatMap[item.categoryMain][item.categorySub] = 
                (subCatMap[item.categoryMain][item.categorySub] || 0) + item.amount;
            });
          } else {
            if (!subCatMap[t.category_main]) {
              subCatMap[t.category_main] = {};
            }
            subCatMap[t.category_main][t.category_sub] = 
              (subCatMap[t.category_main][t.category_sub] || 0) + t.amount;
          }
        });

      const subCatData: Record<string, SubCategoryDataItem[]> = {};
      Object.entries(subCatMap).forEach(([mainCat, subs]) => {
        subCatData[mainCat] = Object.entries(subs)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);
      });
      setSubCategoryData(subCatData);

    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalExpense = categoryData.reduce((sum, c) => sum + c.value, 0);

  // ドリルダウンハンドラー
  const handleMainCategoryClick = (name: string) => {
    setSelectedMainCategory(name);
    setDrillLevel('subcategory');
  };

  const handleSubCategoryClick = (name: string) => {
    setSelectedSubCategory(name);
    setDrillLevel('detail');
  };

  const handleBack = () => {
    if (drillLevel === 'detail') {
      setDrillLevel('subcategory');
      setSelectedSubCategory('');
    } else if (drillLevel === 'subcategory') {
      setDrillLevel('overview');
      setSelectedMainCategory('');
    }
  };

  // 選択月のトランザクションをフィルタ（items対応）
  const getFilteredTransactions = () => {
    const mm = String(selectedMonth).padStart(2, '0');
    const firstDayStr = `${selectedYear}-${mm}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const lastDayStr = `${selectedYear}-${mm}-${String(lastDay.getDate()).padStart(2, '0')}`;
    return transactions.filter(t => {
      if (t.type !== 'expense' || t.date < firstDayStr || t.date > lastDayStr) return false;
      if (t.items && Array.isArray(t.items) && t.items.length > 0) {
        return (t.items as TransactionItem[]).some(item =>
          item.categoryMain === selectedMainCategory &&
          (drillLevel === 'subcategory' || item.categorySub === selectedSubCategory)
        );
      }
      return t.category_main === selectedMainCategory &&
        (drillLevel === 'subcategory' || t.category_sub === selectedSubCategory);
    });
  };

  // 月選択ナビゲーション
  const renderMonthNav = () => (
    <div className="card-solid p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevYear}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToPrevMonth}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={goToCurrentMonth}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
            isCurrentMonth
              ? "text-white"
              : "text-white hover:opacity-80"
          }`}
          style={isCurrentMonth ? { backgroundColor: `${theme.primary}30`, color: theme.primary } : {}}
        >
          {selectedYear}/{String(selectedMonth).padStart(2, '0')}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={goToNextYear}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // Level 1: 概要（円グラフ + カテゴリーリスト）
  const renderOverview = () => (
    <div className="space-y-3">
      {/* 支出ドーナツグラフ */}
      <div className="card-solid p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-red-400" />
          {selectedMonth}月の支出内訳
        </h3>
        {categoryData.length === 0 ? (
          <p className="text-white/40 text-center py-8 text-sm">この月の支出はありません</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              {categoryData.slice(0, 6).map((cat, index) => (
                <div key={cat.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{cat.icon} {cat.name}</p>
                    <p className="text-xs text-red-400 font-semibold">¥{cat.value.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="w-40 h-40 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} formatter={(value: number) => `¥${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-[10px] text-white/40">合計</p>
                  <p className="text-xs font-bold text-white">¥{totalExpense.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* カテゴリー別リスト */}
      {categoryData.length > 0 && (
        <div className="card-solid p-4">
          <h3 className="text-sm font-semibold text-white mb-3">カテゴリー詳細</h3>
          <div className="space-y-2">
            {categoryData.map((cat) => {
              const pct = totalExpense > 0 ? (cat.value / totalExpense * 100) : 0;
              return (
                <button
                  key={cat.name}
                  onClick={() => handleMainCategoryClick(cat.name)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl card-solid-inner hover:bg-white/[0.07] transition-colors text-left"
                >
                  <span className="text-2xl flex-shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-sm">{cat.name}</span>
                      <span className="text-sm font-bold text-red-400">¥{cat.value.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: theme.primary }} />
                      </div>
                      <span className="text-xs text-white/40 flex-shrink-0">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/30 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 年間支出推移 */}
      {yearlyData.length > 0 && (
        <div className="card-solid p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            年間支出推移
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" style={{ fontSize: '11px' }} />
              <YAxis stroke="rgba(255,255,255,0.4)" style={{ fontSize: '11px' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} labelStyle={{ color: '#fff' }} />
              <Bar dataKey="支出" fill="#ef4444" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  // Level 2: サブカテゴリーリスト
  const renderSubcategory = () => {
    const subData = subCategoryData[selectedMainCategory] || [];
    const mainCatTotal = subData.reduce((sum, s) => sum + s.value, 0);
    const icon = categoryIcons[selectedMainCategory] || '📦';

    return (
      <div className="space-y-3">
        <button onClick={handleBack} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
          <span className="text-sm">カテゴリー一覧に戻る</span>
        </button>
        
        <div className="card-solid p-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{icon}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{selectedMainCategory}</h3>
              <p className="text-red-400 font-bold">¥{mainCatTotal.toLocaleString()}</p>
            </div>
          </div>

          {subData.length === 0 ? (
            <p className="text-white/40 text-center py-8">データがありません</p>
          ) : (
            <div className="space-y-2">
              {subData.map((sub) => {
                const pct = mainCatTotal > 0 ? (sub.value / mainCatTotal * 100) : 0;
                return (
                  <button
                    key={sub.name}
                    onClick={() => handleSubCategoryClick(sub.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl card-solid-inner hover:bg-white/[0.07] transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white text-sm">{sub.name}</span>
                        <span className="text-sm font-bold text-red-400">¥{sub.value.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: theme.secondary }} />
                        </div>
                        <span className="text-xs text-white/40 flex-shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/30 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Level 3: 個別トランザクション（items対応）
  const renderDetail = () => {
    const filtered = getFilteredTransactions();

    // items対応: マッチする明細を展開表示
    interface DetailItem {
      id: string;
      date: string;
      category_main: string;
      category_sub: string;
      store_name: string;
      amount: number;
      memo: string;
      parentId?: string;
    }

    const detailItems: DetailItem[] = [];
    filtered.forEach(t => {
      if (t.items && Array.isArray(t.items) && t.items.length > 0) {
        (t.items as TransactionItem[]).filter(item =>
          item.categoryMain === selectedMainCategory &&
          item.categorySub === selectedSubCategory
        ).forEach((item, idx) => {
          detailItems.push({
            id: `${t.id}-item-${idx}`,
            date: t.date,
            category_main: item.categoryMain,
            category_sub: item.categorySub,
            store_name: item.storeName,
            amount: item.amount,
            memo: item.memo,
            parentId: t.id,
          });
        });
      } else if (t.category_sub === selectedSubCategory) {
        detailItems.push({
          id: t.id,
          date: t.date,
          category_main: t.category_main,
          category_sub: t.category_sub,
          store_name: t.store_name,
          amount: t.amount,
          memo: t.memo,
        });
      }
    });

    const subTotal = detailItems.reduce((sum, i) => sum + i.amount, 0);

    return (
      <div className="space-y-3">
        <button onClick={handleBack} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
          <span className="text-sm">{selectedMainCategory} に戻る</span>
        </button>
        
        <div className="card-solid p-4">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-white">{selectedSubCategory}</h3>
            <p className="text-xs text-white/40">{selectedMainCategory} &gt; {selectedSubCategory}</p>
            <p className="text-red-400 font-bold mt-1">合計: ¥{subTotal.toLocaleString()}</p>
          </div>

          {detailItems.length === 0 ? (
            <p className="text-white/40 text-center py-8">データがありません</p>
          ) : (
            <div className="space-y-1.5">
              {detailItems
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((item) => (
                  <ExpenseCard
                    key={item.id}
                    memo={item.memo}
                    storeName={item.store_name}
                    categoryMain={item.category_main}
                    categorySub={item.category_sub}
                    categoryIcon={categoryIcons[item.category_main] || '📦'}
                    amount={item.amount}
                    date={item.date}
                    showDate
                    onEdit={item.parentId ? undefined : () => {
                      setEditingTransaction({
                        id: item.id,
                        date: item.date,
                        category_main: item.category_main,
                        category_sub: item.category_sub,
                        store_name: item.store_name,
                        amount: item.amount,
                        memo: item.memo,
                        user_type: selectedUser,
                      });
                      setIsEditDialogOpen(true);
                    }}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* 月選択ナビゲーション */}
      {renderMonthNav()}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-white/10 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {drillLevel === 'overview' && renderOverview()}
          {drillLevel === 'subcategory' && renderSubcategory()}
          {drillLevel === 'detail' && renderDetail()}
        </>
      )}

      {/* 編集ダイアログ */}
      <EditTransactionDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        transaction={editingTransaction}
      />
    </div>
  );
}
