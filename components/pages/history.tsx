"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { History as HistoryIcon, Calendar as CalendarIcon, List } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
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
  const { selectedUser, theme } = useApp();
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

  // refreshTriggerの変更を監視して自動更新
  const { refreshTrigger } = useApp();
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchTransactions(selectedUser as UserType);
    }
  }, [refreshTrigger]);

  // 日付でグループ化
  const groupedTransactions = transactions.reduce((acc, transaction) => {
    const date = transaction.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(transaction);
    return acc;
  }, {} as Record<string, Transaction[]>);

  // カレンダー用: 各日付の支出合計を計算
  const getDayTotal = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const dayTransactions = groupedTransactions[dateStr] || [];
    return dayTransactions.reduce((sum, t) => sum + t.amount, 0);
  };

  // カレンダーのタイルコンテンツ
  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const total = getDayTotal(date);
      if (total > 0) {
        // 金額のフォーマット（日本人向け）
        let displayAmount: string;
        if (total >= 10000) {
          const man = total / 10000;
          displayAmount = man % 1 === 0 ? `${man.toFixed(0)}万` : `${man.toFixed(1)}万`;
        } else {
          displayAmount = `¥${total.toLocaleString()}`;
        }
        
        return (
          <div className="w-full text-center mt-0.5">
            <p 
              className="text-[10px] font-bold leading-tight px-0.5 py-0.5 rounded"
              style={{ 
                color: theme.primary,
                background: `${theme.primary}15`
              }}
            >
              {displayAmount}
            </p>
          </div>
        );
      }
    }
    return null;
  };

  // タイルのクラス名を動的に設定（支出がある日を強調）
  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const total = getDayTotal(date);
      if (total > 0) {
        return 'has-expense';
      }
    }
    return '';
  };

  return (
    <div className={isCompact ? "space-y-4" : "space-y-6 pb-24"}>
      {/* コンパクトモード時のボタン（スライドタブ） */}
      {isCompact && (
        <div className="relative inline-flex w-full bg-slate-800/50 backdrop-blur-xl rounded-lg p-0.5 border border-slate-700/50">
          <div
            className="absolute top-0.5 bottom-0.5 w-[calc(50%-0.25rem)] bg-gradient-to-r from-blue-600 to-cyan-600 rounded-md transition-transform duration-200"
            style={{
              transform: viewMode === 'calendar' ? 'translateX(calc(100% + 0.25rem))' : 'translateX(0)',
            }}
          />
          <button
            onClick={() => setViewMode('list')}
            className={`relative z-10 flex-1 px-3 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              viewMode === 'list' ? 'text-white' : 'text-gray-400'
            }`}
          >
            <List className="h-3 w-3" />
            一覧
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`relative z-10 flex-1 px-3 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              viewMode === 'calendar' ? 'text-white' : 'text-gray-400'
            }`}
          >
            <CalendarIcon className="h-3 w-3" />
            カレンダー
          </button>
        </div>
      )}

      {/* 履歴コンテンツ */}
      <div className="space-y-6">
        {/* カレンダービュー */}
        {viewMode === 'calendar' && (
          <div className="rounded-2xl overflow-hidden shadow-xl">
            <style>
              {`
                :root {
                  --theme-primary: ${theme.primary};
                  --theme-secondary: ${theme.secondary};
                  --theme-gradient: linear-gradient(135deg, ${theme.primary}, ${theme.secondary});
                  --theme-light: ${theme.primary}10;
                  --theme-light-hover: ${theme.primary}20;
                }
              `}
            </style>
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
              
              {/* 選択した日付の詳細 */}
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
                    <div 
                      className="flex items-center justify-between p-3 rounded-xl border-2"
                      style={{
                        background: `linear-gradient(to right, ${theme.primary}10, ${theme.secondary}05)`,
                        borderColor: theme.primary
                      }}
                    >
                      <span className="font-semibold text-slate-900 text-sm">{selectedDate.toLocaleDateString('ja-JP')}</span>
                      <span className="text-base font-bold" style={{ color: theme.primary }}>-¥{dayTotal.toLocaleString()}</span>
                    </div>
                    <div className="space-y-2 bg-white/50 rounded-xl p-2">
                      {dayTransactions.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white/90 border border-gray-200/50 hover:bg-white hover:shadow-md transition-all"
                        >
                          <div className="text-2xl p-2 rounded-lg bg-gray-50">
                            {categoryIcons[transaction.category_main] || '📦'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-slate-900 truncate">
                              {transaction.store_name || transaction.memo || transaction.category_sub}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-600">
                                {transaction.category_main}
                              </span>
                            </div>
                          </div>
                          <p className="text-base font-bold" style={{ color: theme.primary }}>
                            -¥{transaction.amount.toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })(              )}
            </div>
          </div>
        )}

        {/* 一覧ビュー */}
        {viewMode === 'list' && (
          <>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-0 shadow-xl">
                    <CardContent className="p-6 animate-pulse">
                      <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded mb-4"></div>
                      <div className="space-y-3">
                        <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
                        <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : Object.keys(groupedTransactions).length === 0 ? (
              <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-0 shadow-xl">
                <CardContent className="p-12 text-center">
                  <HistoryIcon className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
                  <p className="text-lg font-semibold text-muted-foreground">まだ履歴がありません</p>
                  <p className="text-sm text-muted-foreground mt-2">支出を記録すると、ここに表示されます</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedTransactions).map(([date, dayTransactions]) => {
                  const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount, 0);
                  
                  return (
                    <div key={date} className="bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/30 overflow-hidden shadow-lg">
                      {/* 日付ヘッダー（テーマカラー） */}
                      <div 
                        className="flex items-center justify-between px-4 py-2.5"
                        style={{
                          background: `linear-gradient(to right, ${theme.primary}15, ${theme.secondary}10)`
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" style={{ color: theme.primary }} />
                          <p className="text-sm font-bold text-white">{date}</p>
                        </div>
                        <span className="text-base font-bold text-red-400">
                          -¥{dayTotal.toLocaleString()}
                        </span>
                      </div>
                      
                      {/* 明細リスト */}
                      <div className="divide-y divide-slate-700/30">
                        {dayTransactions.map((transaction) => (
                          <div
                            key={transaction.id}
                            className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/20 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="text-xl leading-none">
                                {categoryIcons[transaction.category_main] || '📦'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white text-sm truncate leading-tight">
                                  {transaction.store_name || transaction.memo || transaction.category_sub}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-xs text-gray-400">{transaction.category_main}</span>
                                  {transaction.category_sub && (
                                    <>
                                      <span className="text-gray-600">•</span>
                                      <span className="text-xs text-gray-500">{transaction.category_sub}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right ml-3">
                              <p className="text-base font-bold text-red-400 leading-tight">
                                -¥{transaction.amount.toLocaleString()}
                              </p>
                            </div>
                          </div>
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
