"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/contexts/app-context";
import { 
  Wallet, 
  TrendingDown, 
  UtensilsCrossed, 
  Coffee, 
  PiggyBank, 
  Calendar,
  ChevronRight
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { supabase } from "@/lib/supabase";
import { QuickStatsCard } from "@/components/widgets/quick-stats-card";
import { ExpenseCard } from "@/components/widgets/expense-card";

type UserType = "共同" | "れん" | "あかね";

interface Transaction {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name: string;
  amount: number;
  memo: string;
}

interface CategoryBudget {
  category: string;
  icon: string;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
}

const BUDGETS = {
  共同: 150000,
  れん: 80000,
  あかね: 70000,
};

const CHART_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

interface DashboardProps {
  onNavigateToAnalysis?: () => void;
}

export function Dashboard({ onNavigateToAnalysis }: DashboardProps) {
  const { selectedUser, theme, refreshTrigger } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [monthlySpent, setMonthlySpent] = useState(0);
  const [income, setIncome] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>({});
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);

  const fetchCategoryIcons = async () => {
    const { data } = await supabase
      .from('categories')
      .select('main_category, icon');
    
    if (data) {
      const icons: Record<string, string> = {};
      data.forEach(cat => {
        icons[cat.main_category] = cat.icon;
      });
      setCategoryIcons(icons);
    }
  };

  const getMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: firstDay.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0],
    };
  };

  const fetchData = async (userType: UserType) => {
    setIsLoading(true);
    try {
      const { start, end } = getMonthRange();

      const { data: monthlyData } = await supabase
        .from('transactions')
        .select('amount, category_main')
        .eq('user_type', userType)
        .eq('type', 'expense')
        .gte('date', start)
        .lte('date', end);

      const total = monthlyData?.reduce((sum, t) => sum + t.amount, 0) || 0;
      setMonthlySpent(total);

      let incomeQuery = supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'income')
        .gte('date', start)
        .lte('date', end);

      if (userType === '共同') {
        const { data: incomeData } = await incomeQuery.in('user_type', ['れん', 'あかね']);
        const totalIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        setIncome(totalIncome);
      } else {
        const { data: incomeData } = await incomeQuery.eq('user_type', userType);
        const totalIncome = incomeData?.reduce((sum, t) => sum + t.amount, 0) || 0;
        setIncome(totalIncome);
      }

      const categoryMap: Record<string, number> = {};
      monthlyData?.forEach(t => {
        categoryMap[t.category_main] = (categoryMap[t.category_main] || 0) + t.amount;
      });

      const breakdown = Object.entries(categoryMap).map(([category, amount]) => ({
        name: category,
        value: amount,
      }));
      setCategoryBreakdown(breakdown);

      const { data: budgetsData } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_type', userType);

      const budgetMap: Record<string, number> = {};
      budgetsData?.forEach(b => {
        budgetMap[b.category_main] = b.monthly_budget;
      });

      const budgets: CategoryBudget[] = Object.entries(budgetMap)
        .filter(([_, budget]) => budget > 0)
        .map(([category, budget]) => {
          const spent = categoryMap[category] || 0;
          const remaining = budget - spent;
          const percentage = (spent / budget) * 100;
          return {
            category,
            icon: categoryIcons[category] || '📦',
            budget,
            spent,
            remaining,
            percentage: Math.min(percentage, 100),
          };
        });
      setCategoryBudgets(budgets);

      const { data: recentData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_type', userType)
        .eq('type', 'expense')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentTransactions(recentData || []);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategoryIcons();
  }, []);

  useEffect(() => {
    if (Object.keys(categoryIcons).length > 0) {
      fetchData(selectedUser as UserType);
    }
  }, [selectedUser, categoryIcons]);

  useEffect(() => {
    if (Object.keys(categoryIcons).length > 0 && refreshTrigger > 0) {
      fetchData(selectedUser as UserType);
    }
  }, [refreshTrigger]);

  const balance = income - monthlySpent;

  const groupedTransactions = recentTransactions.reduce((acc, transaction) => {
    const date = transaction.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(transaction);
    return acc;
  }, {} as Record<string, Transaction[]>);

  const foodSpent = categoryBreakdown.find(c => c.name === '食費')?.value || 0;
  const foodBudget = categoryBudgets.find(c => c.category === '食費')?.budget || 0;
  const foodRemaining = foodBudget > 0 ? foodBudget - foodSpent : 0;

  const diningOutCount = recentTransactions.filter(t => 
    t.category_sub === '外食' || t.category_sub === 'カフェ・間食'
  ).length;

  const today = new Date();
  const nextPayday = new Date(today.getFullYear(), today.getMonth() + 1, 25);
  const daysToPayday = Math.ceil((nextPayday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.08) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="bold">
        {name}
      </text>
    );
  };

  return (
    <div className="space-y-3 pb-24 pt-3">
      {/* サマリーカード */}
      <div
        className="relative backdrop-blur-xl shadow-xl overflow-hidden rounded-2xl p-4"
        style={{
          background: theme.cardBg,
          border: `1px solid rgba(255,255,255,0.1)`,
        }}
      >
        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-white/10 rounded-xl" />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-xs text-white/50 mb-0.5">収入</p>
                <p className="text-xl font-bold text-green-400">+¥{income.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-white/50 mb-0.5">支出</p>
                <p className="text-xl font-bold text-red-400">-¥{monthlySpent.toLocaleString()}</p>
              </div>
              <div className="pt-1.5 border-t border-white/10">
                <p className="text-xs text-white/50 mb-0.5">収支</p>
                <p className={`text-2xl font-bold ${balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {balance >= 0 ? '+' : ''}¥{balance.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="w-32 h-32 cursor-pointer hover:scale-105 transition-transform" onClick={onNavigateToAnalysis}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270} label={renderCustomLabel} labelLine={false}>
                    {categoryBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-xs text-white/40 -mt-1">タップで詳細</p>
            </div>
          </div>
        )}
      </div>

      {/* 4つの小カード */}
      <div className="grid grid-cols-2 gap-3">
        <QuickStatsCard title="食費残高" value={foodBudget > 0 ? `¥${foodRemaining.toLocaleString()}` : '未設定'} icon={UtensilsCrossed} subtitle={foodBudget > 0 ? `¥${foodBudget.toLocaleString()}中` : '予算を設定してください'} colorClass="from-orange-500 to-red-500" />
        <QuickStatsCard title="外食回数" value={`${diningOutCount}回`} icon={Coffee} subtitle="今月" colorClass="from-pink-500 to-purple-500" />
        <QuickStatsCard title="貯金進捗" value="0%" icon={PiggyBank} subtitle="目標: 未設定" colorClass="from-green-500 to-emerald-500" />
        <QuickStatsCard title="給料日" value={`${daysToPayday}日後`} icon={Calendar} subtitle="25日" colorClass="from-blue-500 to-cyan-500" />
      </div>

      {/* カテゴリー予算リスト */}
      <div className="rounded-2xl overflow-hidden" style={{ background: theme.cardBg, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5" style={{ color: theme.secondary }} />
            カテゴリー予算
          </h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (<div key={i} className="h-20 bg-white/10 rounded-xl animate-pulse" />))}
            </div>
          ) : (
            <div className="space-y-3">
              {categoryBudgets.map((item) => (
                <div key={item.category} className="p-3 rounded-xl bg-black/15 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{item.icon}</span>
                      <div>
                        <p className="font-semibold text-white text-sm">{item.category}</p>
                        <p className="text-xs text-white/40">¥{item.spent.toLocaleString()} / ¥{item.budget.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${item.remaining >= 0 ? 'text-green-400' : 'text-red-400'}`}>¥{item.remaining.toLocaleString()}</p>
                      <p className="text-xs text-white/40">残り</p>
                    </div>
                  </div>
                  <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={`absolute top-0 left-0 h-full transition-all duration-500 rounded-full ${item.percentage > 80 ? 'bg-gradient-to-r from-red-500 to-pink-500' : item.percentage > 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : 'bg-gradient-to-r from-green-500 to-emerald-500'}`} style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 日別支出リスト（メモ主役カード） */}
      <div className="rounded-2xl overflow-hidden" style={{ background: theme.cardBg, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-400" />
              最近の支出
            </h3>
            <button className="text-sm text-white/50 hover:text-white/80 flex items-center gap-1">
              すべて見る
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (<div key={i} className="h-16 bg-white/10 rounded-xl animate-pulse" />))}
            </div>
          ) : Object.keys(groupedTransactions).length === 0 ? (
            <div className="text-center py-12">
              <TrendingDown className="w-12 h-12 mx-auto text-white/20 mb-3" />
              <p className="text-white/40">まだ支出がありません</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedTransactions).slice(0, 5).map(([date, dayTransactions]) => {
                const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount, 0);
                const dateObj = new Date(date);
                const weekday = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
                
                return (
                  <div key={date} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-white/40" />
                        <p className="text-sm font-semibold text-white/70">
                          {dateObj.getMonth() + 1}月{dateObj.getDate()}日({weekday})
                        </p>
                      </div>
                      <p className="text-sm font-bold text-red-400">-¥{dayTotal.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1.5">
                      {dayTransactions.map((t) => (
                        <ExpenseCard
                          key={t.id}
                          memo={t.memo}
                          storeName={t.store_name}
                          categoryMain={t.category_main}
                          categorySub={t.category_sub}
                          categoryIcon={categoryIcons[t.category_main] || '📦'}
                          amount={t.amount}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
