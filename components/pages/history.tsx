"use client";

import { useState, useEffect } from "react";
import { History as HistoryIcon, Calendar as CalendarIcon, List } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { ExpenseCard } from "@/components/widgets/expense-card";
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

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

interface HistoryProps {
  isCompact?: boolean;
}

export function History({ isCompact = false }: HistoryProps) {
  const { selectedUser, theme, refreshTrigger } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState(new Date());

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

  const fetchTransactions = async (userType: UserType) => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_type', userType)
        .eq('type', 'expense')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      setTransactions(data || []);
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
    fetchTransactions(selectedUser as UserType);
  }, [selectedUser]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchTransactions(selectedUser as UserType);
    }
  }, [refreshTrigger]);

  const groupedTransactions = transactions.reduce((acc, transaction) => {
    const date = transaction.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(transaction);
    return acc;
  }, {} as Record<string, Transaction[]>);

  const getDayTotal = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const dayTransactions = groupedTransactions[dateStr] || [];
    return dayTransactions.reduce((sum, t) => sum + t.amount, 0);
  };

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const total = getDayTotal(date);
      if (total > 0) {
        let displayAmount: string;
        if (total >= 10000) {
          const man = total / 10000;
          displayAmount = man % 1 === 0 ? `${man.toFixed(0)}万` : `${man.toFixed(1)}万`;
        } else {
          displayAmount = `¥${total.toLocaleString()}`;
        }
        
        return (
          <div className="w-full text-center mt-0.5">
            <p className="text-[10px] font-bold leading-tight px-0.5 py-0.5 rounded"
              style={{ color: theme.primary, background: `${theme.primary}15` }}>
              {displayAmount}
            </p>
          </div>
        );
      }
    }
    return null;
  };

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const total = getDayTotal(date);
      if (total > 0) return 'has-expense';
    }
    return '';
  };

  return (
    <div className={isCompact ? "space-y-4" : "space-y-6 pb-24"}>
      {/* コンパクトモード時のタブ */}
      {isCompact && (
        <div className="relative inline-flex w-full rounded-lg p-0.5 border border-white/10" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <div
            className="absolute top-0.5 bottom-0.5 w-[calc(50%-0.25rem)] rounded-md transition-transform duration-200"
            style={{
              transform: viewMode === 'calendar' ? 'translateX(calc(100% + 0.25rem))' : 'translateX(0)',
              background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
            }}
          />
          <button onClick={() => setViewMode('list')} className={`relative z-10 flex-1 px-3 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${viewMode === 'list' ? 'text-white' : 'text-white/40'}`}>
            <List className="h-3 w-3" />
            一覧
          </button>
          <button onClick={() => setViewMode('calendar')} className={`relative z-10 flex-1 px-3 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${viewMode === 'calendar' ? 'text-white' : 'text-white/40'}`}>
            <CalendarIcon className="h-3 w-3" />
            カレンダー
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* カレンダービュー */}
        {viewMode === 'calendar' && (
          <div className="rounded-2xl overflow-hidden shadow-xl">
            <style>{`
              :root {
                --theme-primary: ${theme.primary};
                --theme-secondary: ${theme.secondary};
                --theme-gradient: linear-gradient(135deg, ${theme.primary}, ${theme.secondary});
                --theme-light: ${theme.primary}10;
              }
            `}</style>
            <div className="calendar-wrapper">
              <Calendar
                onChange={(value) => setSelectedDate(value as Date)}
                value={selectedDate}
                tileContent={tileContent}
                tileClassName={tileClassName}
                locale="ja-JP"
                className="w-full"
              />
            </div>
            <div className="bg-white/95 p-3 border-t border-gray-200">
              {(() => {
                const dateStr = selectedDate.toISOString().split('T')[0];
                const dayTransactions = groupedTransactions[dateStr] || [];
                const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount, 0);

                if (dayTransactions.length === 0) {
                  return (
                    <div className="text-center py-6">
                      <CalendarIcon className="h-10 w-10 mx-auto mb-2" style={{ color: theme.primary, opacity: 0.3 }} />
                      <p className="text-gray-500 text-sm">この日の記録はありません</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-xl border-2" style={{ background: `linear-gradient(to right, ${theme.primary}10, ${theme.secondary}05)`, borderColor: theme.primary }}>
                      <span className="font-semibold text-slate-900 text-sm">{selectedDate.toLocaleDateString('ja-JP')}</span>
                      <span className="text-base font-bold" style={{ color: theme.primary }}>-¥{dayTotal.toLocaleString()}</span>
                    </div>
                    <div className="space-y-2 bg-white/50 rounded-xl p-2">
                      {dayTransactions.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/90 border border-gray-200/50">
                          <div className="text-2xl p-2 rounded-lg bg-gray-50">{categoryIcons[t.category_main] || '📦'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-slate-900 truncate">{t.memo || t.store_name || t.category_sub}</p>
                            <p className="text-xs text-gray-500">{t.category_main} · {t.category_sub}</p>
                          </div>
                          <p className="text-base font-bold" style={{ color: theme.primary }}>-¥{t.amount.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* 一覧ビュー（メモ主役カード） */}
        {viewMode === 'list' && (
          <>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (<div key={i} className="h-16 bg-white/10 rounded-xl animate-pulse" />))}
              </div>
            ) : Object.keys(groupedTransactions).length === 0 ? (
              <div className="text-center py-12">
                <HistoryIcon className="h-16 w-16 mx-auto text-white/20 mb-4" />
                <p className="text-lg font-semibold text-white/40">まだ履歴がありません</p>
                <p className="text-sm text-white/30 mt-2">支出を記録すると、ここに表示されます</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedTransactions).map(([date, dayTransactions]) => {
                  const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount, 0);
                  
                  return (
                    <div key={date} className="rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {/* 日付ヘッダー */}
                      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: `rgba(255,255,255,0.05)` }}>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-3.5 w-3.5 text-white/40" />
                          <p className="text-sm font-bold text-white/70">{date}</p>
                        </div>
                        <span className="text-sm font-bold text-red-400">-¥{dayTotal.toLocaleString()}</span>
                      </div>
                      
                      {/* 明細（ExpenseCard） */}
                      <div className="p-2 space-y-1.5">
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
          </>
        )}
      </div>
    </div>
  );
}
