"use client";

interface ExpenseCardProps {
  memo?: string | null;
  storeName?: string | null;
  categoryMain: string;
  categorySub: string;
  categoryIcon?: string;
  amount: number;
  date?: string;
  showDate?: boolean;
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
}: ExpenseCardProps) {
  // メモ > 店名 > 小カテゴリー の優先順位で表示
  const mainText = memo || storeName || categorySub;
  // メインに使われなかった情報をサブに表示
  const subStore = memo && storeName ? storeName : null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-black/15 border border-white/5 hover:bg-black/20 transition-colors">
      {/* カテゴリーアイコン */}
      <div className="text-xl leading-none flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white/10">
        {categoryIcon}
      </div>

      {/* テキスト部分 */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm truncate leading-tight">
          {mainText}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-white/50">{categoryMain}</span>
          <span className="text-white/30">·</span>
          <span className="text-xs text-white/40">{categorySub}</span>
          {subStore && (
            <>
              <span className="text-white/30">·</span>
              <span className="text-xs text-white/40 truncate">{subStore}</span>
            </>
          )}
        </div>
      </div>

      {/* 金額 + 日付 */}
      <div className="text-right flex-shrink-0 ml-2">
        <p className="text-base font-bold text-red-400 leading-tight">
          -¥{amount.toLocaleString()}
        </p>
        {showDate && date && (
          <p className="text-xs text-white/40 mt-0.5">
            {new Date(date).getMonth() + 1}/{new Date(date).getDate()}
          </p>
        )}
      </div>
    </div>
  );
}
