"use client";

interface DeductionBarProps {
  /** Deduction rate as a 0–100 integer (e.g. 17 for 17%) */
  rate: number;
  /** Label shown above the bar (e.g. "控除率", "年間控除率"). Omit to render compact variant. */
  label?: string;
  /** Optional absolute deduction amount — when set, rendered as "-¥{amount} ({rate}%)" */
  amount?: number;
  /** Bar thickness — "sm" (inline, no frame/labels), "md" (default, framed) */
  size?: "sm" | "md";
}

/**
 * Two-color progress bar showing take-home vs deduction split.
 * `md` variant wraps in a card with header + % legend; `sm` is a naked thin bar.
 */
export function DeductionBar({
  rate,
  label,
  amount,
  size = "md",
}: DeductionBarProps) {
  const takeHomeRate = Math.max(0, 100 - rate);

  if (size === "sm") {
    return (
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
        <div className="h-full flex">
          <div
            className="h-full bg-green-500 rounded-l-full"
            style={{ width: `${takeHomeRate}%` }}
          />
          <div
            className="h-full bg-orange-500 rounded-r-full"
            style={{ width: `${rate}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl card-solid-inner">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/60">{label}</span>
        <span className="text-sm font-bold text-orange-400">
          {amount !== undefined
            ? `-¥${amount.toLocaleString()} (${rate}%)`
            : `${rate}%`}
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full flex">
          <div
            className="h-full bg-green-500 rounded-l-full"
            style={{ width: `${takeHomeRate}%` }}
          />
          <div
            className="h-full bg-orange-500 rounded-r-full"
            style={{ width: `${rate}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-green-400/60">
          手取り {takeHomeRate}%
        </span>
        <span className="text-[10px] text-orange-400/60">
          控除 {rate}%
        </span>
      </div>
    </div>
  );
}
