"use client";

import { Pencil } from "lucide-react";

export interface ExpenseCardProps {
  id?: string;
  memo?: string | null;
  storeName?: string | null;
  categoryMain: string;
  categorySub: string;
  categoryIcon?: string;
  amount: number;
  date?: string;
  showDate?: boolean;
  onEdit?: () => void;
  type?: "expense" | "income";
  items?: { categoryMain: string; categorySub: string; storeName: string; amount: number; memo: string }[] | null;
}

export function ExpenseCard({
  memo,
  storeName,
  categoryMain,
  categorySub,
  categoryIcon = "📦",
  amount,
  date,
  showDate = false,
  onEdit,
  type = "expense",
  items,
}: ExpenseCardProps) {
  const isIncome = type === "income";
  const hasItems = items && Array.isArray(items) && items.length > 1;

  // レシート（items複数）の場合は店名メインで品目数表示
  const mainText = hasItems
    ? storeName || items![0]?.storeName || categoryMain
    : memo || storeName || categorySub;
  const subStore = hasItems
    ? null
    : memo && storeName ? storeName : null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl card-solid-inner hover:bg-white/[0.07] transition-colors">
      {/* カテゴリーアイコン */}
      <div className="text-xl leading-none flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white/10">
        {isIncome ? "💰" : categoryIcon}
      </div>

      {/* 左: メモ + 店名/カテゴリ */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm truncate leading-tight">
          {mainText}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {subStore && (
            <>
              <span className="text-xs text-white/40 truncate max-w-[80px]">{subStore}</span>
              <span className="text-white/30">·</span>
            </>
          )}
          {hasItems ? (
            <span className="inline-flex items-center bg-blue-500/20 rounded-full px-2 py-0.5 text-[10px] text-blue-300">
              📋 {items!.length}品目
            </span>
          ) : (
            <span className="inline-flex items-center bg-white/10 rounded-full px-2 py-0.5 text-[10px] text-white/60">
              {categorySub}
            </span>
          )}
        </div>
      </div>

      {/* 右: 金額 + 編集ボタン */}
      <div className="flex flex-col items-end flex-shrink-0 ml-2 gap-1">
        <p className={`text-base font-bold leading-tight whitespace-nowrap ${isIncome ? 'text-green-400' : 'text-red-400'}`}>
          {isIncome ? '+' : '-'}¥{amount.toLocaleString()}
        </p>
        <div className="flex items-center gap-2">
          {showDate && date && (
            <span className="text-[10px] text-white/40">
              {new Date(date).getMonth() + 1}/{new Date(date).getDate()}
            </span>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 rounded-md hover:bg-white/10 transition-colors text-white/40 hover:text-white/70"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
