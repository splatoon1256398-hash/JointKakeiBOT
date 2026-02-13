"use client";

import { useState } from "react";
import { Pencil, ChevronDown } from "lucide-react";

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

// カテゴリアイコンマップ
const CATEGORY_ICONS: Record<string, string> = {
  "食費": "🍽️", "日用品": "🧴", "交通費": "🚃", "医療費": "🏥",
  "衣服・美容": "👗", "趣味・娯楽": "🎮", "教育・教養": "📚",
  "住居費": "🏠", "水道・光熱費": "💡", "通信費": "📱",
  "保険料": "🛡️", "税金": "🏛️", "その他": "📦",
};

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
  const [expanded, setExpanded] = useState(false);
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
    <div className="rounded-xl card-solid-inner hover:bg-white/[0.07] transition-colors">
      {/* メインカード行 */}
      <div
        className={`flex items-center gap-3 p-3 ${hasItems ? "cursor-pointer select-none" : ""}`}
        onClick={hasItems ? () => setExpanded(!expanded) : undefined}
      >
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
              <span className="inline-flex items-center gap-1 bg-blue-500/20 rounded-full px-2 py-0.5 text-[10px] text-blue-300">
                📋 {items!.length}品目
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
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

      {/* アコーディオン: 品目一覧 */}
      {hasItems && expanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="border-t border-white/10 pt-2 space-y-1.5">
            {items!.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="flex-shrink-0 w-5 text-center">
                  {CATEGORY_ICONS[item.categoryMain] || "📦"}
                </span>
                <span className="flex-1 min-w-0 truncate text-white/80">
                  {item.memo || item.categorySub}
                </span>
                <span className="inline-flex items-center bg-white/5 rounded px-1.5 py-0.5 text-[10px] text-white/40">
                  {item.categorySub}
                </span>
                <span className="flex-shrink-0 text-white/70 font-medium tabular-nums">
                  ¥{item.amount.toLocaleString()}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-white/30 text-right mt-1">※税込按分後の金額</p>
          </div>
        </div>
      )}
    </div>
  );
}
