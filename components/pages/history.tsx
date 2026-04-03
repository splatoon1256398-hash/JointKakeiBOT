"use client";

import { useState, useEffect } from "react";
import { History as HistoryIcon, Calendar as CalendarIcon, List, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import { ExpenseCard } from "@/components/widgets/expense-card";
import { EditTransactionDialog, TransactionForEdit } from "@/components/edit-transaction-dialog";
import { Input } from "@/components/ui/input";
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

type UserType = "共同" | "れん" | "あかね";

/** Date → YYYY-MM-DD (ローカルタイムゾーン準拠、UTC変換しない) */
const toLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface Transaction {
  id: string;
  date: string;
  category_main: string;
  category_sub: string;
  store_name: string;
  amount: number;
  memo: string;
  type: string;
  items?: { categoryMain: string; categorySub: string; storeName: string; amount: number; memo: string }[] | null;
  metadata?: { gross_amount?: number } | null;
  source?: string;
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
  const [editingTransaction, setEditingTransaction] = useState<TransactionForEdit | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [targetTxId, setTargetTxId] = useState<string | null>(null);

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
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

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
  }, [refreshTrigger, selectedUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    const txIdParam = params.get("txId");
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;

    const d = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setSelectedDate(d);
    setViewMode("calendar");
    if (txIdParam) setTargetTxId(txIdParam);
  }, []);

  useEffect(() => {
    if (!targetTxId || isLoading) return;

    let attempts = 0;
    const maxAttempts = 8;

    const scrollToTarget = () => {
      const target = document.querySelector(`[data-tx-id="${targetTxId}"]`) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(scrollToTarget, 250);
      }
    };

    scrollToTarget();
  }, [targetTxId, isLoading, viewMode, selectedDate, transactions, searchQuery]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTransactions = transactions.filter((t) => {
    if (!normalizedQuery) return true;
    const words = [
      t.date,
      t.category_main,
      t.category_sub,
      t.store_name,
      t.memo,
      t.type,
      String(t.amount),
      `¥${t.amount}`,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.includes(normalizedQuery);
  });

  const groupedTransactions = filteredTransactions.reduce((acc, transaction) => {
    const date = transaction.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(transaction);
    return acc;
  }, {} as Record<string, Transaction[]>);

  const getDayTotal = (date: Date) => {
    const dateStr = toLocalDateStr(date);
    const dayTransactions = groupedTransactions[dateStr] || [];
    const expenses = dayTransactions.filter(t => t.type !== 'income').reduce((sum, t) => sum + t.amount, 0);
    const incomes = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    return { expenses, incomes, net: incomes - expenses };
  };

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const { expenses, incomes } = getDayTotal(date);
      if (expenses > 0 || incomes > 0) {
        const expenseText = expenses > 0
          ? (expenses >= 10000 ? `-${(expenses / 10000).toFixed(expenses % 10000 === 0 ? 0 : 1)}万` : `-¥${expenses.toLocaleString()}`)
          : null;
        const incomeText = incomes > 0
          ? (incomes >= 10000 ? `+${(incomes / 10000).toFixed(incomes % 10000 === 0 ? 0 : 1)}万` : `+¥${incomes.toLocaleString()}`)
          : null;
        
        return (
          <div className="w-full text-center mt-0.5 space-y-0.5">
            {expenseText && (
              <p className="text-[10px] font-bold leading-tight px-0.5 rounded text-red-500 bg-red-500/10">
                {expenseText}
              </p>
            )}
            {incomeText && (
              <p className="text-[10px] font-bold leading-tight px-0.5 rounded text-emerald-500 bg-emerald-500/10">
                {incomeText}
              </p>
            )}
          </div>
        );
      }
    }
    return null;
  };

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view === 'month') {
      const { expenses, incomes } = getDayTotal(date);
      if (expenses > 0 || incomes > 0) return 'has-expense';
    }
    return '';
  };

  return (
    <div className={isCompact ? "space-y-4" : "space-y-6 pb-24"}>
      <div className="flex items-center justify-end gap-2">
        {isSearchOpen ? (
          <div className="flex items-center gap-2 w-full">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="店名・メモ・カテゴリ・金額で検索"
              className="h-9 bg-slate-800/60 border-white/15 text-white placeholder:text-white/40"
            />
            <button
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
              className="h-9 w-9 rounded-full border border-white/20 bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors flex items-center justify-center"
              aria-label="検索を閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsSearchOpen(true)}
            className="h-9 w-9 rounded-full border border-white/20 bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors flex items-center justify-center"
            aria-label="検索"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </div>

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
          <div className="space-y-6">
            {/* カレンダーコンテナ: card-solid + 中央配置 */}
            <div className="card-solid overflow-hidden mx-auto max-w-md w-full">
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
            </div>

            {/* 選択日の支出カード一覧: mt-6 でカレンダーと余白確保 */}
            <div className="card-solid overflow-hidden">
              {(() => {
                const dateStr = toLocalDateStr(selectedDate);
                const dayTransactions = groupedTransactions[dateStr] || [];
                const dayExpense = dayTransactions.filter(t => t.type !== 'income').reduce((sum, t) => sum + t.amount, 0);
                const dayIncome = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

                if (dayTransactions.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <CalendarIcon className="h-10 w-10 mx-auto mb-2 text-white/15" />
                      <p className="text-white/40 text-sm">この日の記録はありません</p>
                    </div>
                  );
                }

                return (
                  <div>
                    {/* 日付ヘッダー */}
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: `rgba(255,255,255,0.05)` }}>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-3.5 w-3.5 text-white/40" />
                        <p className="text-sm font-bold text-white/70">
                          {selectedDate.toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {dayIncome > 0 && <span className="text-sm font-bold text-green-400">+¥{dayIncome.toLocaleString()}</span>}
                        {dayExpense > 0 && <span className="text-sm font-bold text-red-400">-¥{dayExpense.toLocaleString()}</span>}
                      </div>
                    </div>

                    {/* 明細 */}
                    <div className="p-2 space-y-1.5">
                      {dayTransactions.map((t) => (
                        <div
                          key={t.id}
                          data-tx-id={t.id}
                          className={targetTxId === t.id ? "rounded-xl ring-2 ring-yellow-300/90 shadow-lg shadow-yellow-300/20" : ""}
                        >
                          <ExpenseCard
                            memo={t.memo}
                            storeName={t.store_name}
                            categoryMain={t.category_main}
                            categorySub={t.category_sub}
                            categoryIcon={categoryIcons[t.category_main] || '📦'}
                            amount={t.amount}
                            type={t.type as "expense" | "income"}
                            items={t.items}
                            source={t.source}
                            onEdit={() => {
                              setEditingTransaction({
                                id: t.id,
                                date: t.date,
                                category_main: t.category_main,
                                category_sub: t.category_sub,
                                store_name: t.store_name,
                                amount: t.amount,
                                memo: t.memo,
                                user_type: selectedUser,
                                type: t.type,
                                items: t.items,
                                metadata: t.metadata,
                              });
                              setIsEditDialogOpen(true);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* 一覧ビュー */}
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
                  const dayExpense = dayTransactions.filter(t => t.type !== 'income').reduce((sum, t) => sum + t.amount, 0);
                  const dayIncome = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                  
                  return (
                    <div key={date} className="card-solid overflow-hidden">
                      {/* 日付ヘッダー */}
                      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: `rgba(255,255,255,0.05)` }}>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-3.5 w-3.5 text-white/40" />
                          <p className="text-sm font-bold text-white/70">{date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {dayIncome > 0 && <span className="text-sm font-bold text-green-400">+¥{dayIncome.toLocaleString()}</span>}
                          {dayExpense > 0 && <span className="text-sm font-bold text-red-400">-¥{dayExpense.toLocaleString()}</span>}
                        </div>
                      </div>
                      
                      {/* 明細（ExpenseCard） */}
                      <div className="p-2 space-y-1.5">
                        {dayTransactions.map((t) => (
                          <div
                            key={t.id}
                            data-tx-id={t.id}
                            className={targetTxId === t.id ? "rounded-xl ring-2 ring-yellow-300/90 shadow-lg shadow-yellow-300/20" : ""}
                          >
                            <ExpenseCard
                              memo={t.memo}
                              storeName={t.store_name}
                              categoryMain={t.category_main}
                              categorySub={t.category_sub}
                              categoryIcon={categoryIcons[t.category_main] || '📦'}
                              amount={t.amount}
                              type={t.type as "expense" | "income"}
                              items={t.items}
                              source={t.source}
                              onEdit={() => {
                                setEditingTransaction({
                                  id: t.id,
                                  date: t.date,
                                  category_main: t.category_main,
                                  category_sub: t.category_sub,
                                  store_name: t.store_name,
                                  amount: t.amount,
                                  memo: t.memo,
                                  user_type: selectedUser,
                                  type: t.type,
                                  items: t.items,
                                  metadata: t.metadata,
                                });
                                setIsEditDialogOpen(true);
                              }}
                            />
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

      {/* 編集ダイアログ */}
      <EditTransactionDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        transaction={editingTransaction}
      />
    </div>
  );
}
