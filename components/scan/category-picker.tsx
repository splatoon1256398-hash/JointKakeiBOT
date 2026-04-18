"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

export interface PickerCategory {
  main: string;
  icon: string;
  subs: string[];
}

export type PickerTone = "purple" | "green";

interface CategoryPickerProps {
  /** Whether the picker is open */
  open: boolean;
  /** Available categories to choose from */
  categories: PickerCategory[];
  /** Currently selected main category (for highlighting) */
  currentMain: string;
  /** Currently selected sub category (for highlighting) */
  currentSub: string;
  /** Called when user picks a (main, sub) pair */
  onSelect: (main: string, sub: string) => void;
  /** Called when user dismisses the picker */
  onClose: () => void;
  /** Display tone (purple = expense, green = income) */
  tone?: PickerTone;
  /** Header label for the main step */
  mainTitle?: string;
  /** Layout for main step grid columns */
  mainColumns?: 2 | 3;
}

const TONE_CONFIG: Record<
  PickerTone,
  { shadow: string; selectedBorder: string; selectedBg: string; glow: string }
> = {
  purple: {
    shadow: "0 8px 32px rgba(120,60,255,0.25)",
    selectedBorder: "border-purple-500/60",
    selectedBg: "bg-purple-500/15",
    glow: "0 0 12px rgba(168,85,247,0.4)",
  },
  green: {
    shadow: "0 8px 32px rgba(16,185,129,0.25)",
    selectedBorder: "border-green-500/60",
    selectedBg: "bg-green-500/15",
    glow: "0 0 12px rgba(16,185,129,0.4)",
  },
};

/**
 * Two-step category picker — main (large grid) → sub (list).
 * Rendered via a portal so it sits above any Radix dialog transforms.
 */
export function CategoryPicker({
  open,
  categories,
  currentMain,
  currentSub,
  onSelect,
  onClose,
  tone = "purple",
  mainTitle = "カテゴリーを選択",
  mainColumns = 3,
}: CategoryPickerProps) {
  const [step, setStep] = useState<"main" | "sub">("main");
  const [tempMain, setTempMain] = useState(currentMain);

  if (!open || typeof document === "undefined") return null;

  const config = TONE_CONFIG[tone];
  const subs =
    categories.find((c) => c.main === tempMain)?.subs ?? ["その他"];
  const tempIcon =
    categories.find((c) => c.main === tempMain)?.icon ?? "📦";

  const handleClose = () => {
    setStep("main");
    onClose();
  };

  const handleMainPick = (main: string) => {
    setTempMain(main);
    setStep("sub");
  };

  const handleSubPick = (sub: string) => {
    onSelect(tempMain, sub);
    setStep("main");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-auto"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-slate-900 border border-white/15 rounded-2xl p-4 w-full max-w-sm flex flex-col"
        style={{ boxShadow: config.shadow, maxHeight: "60vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {step === "sub" && (
              <button
                type="button"
                onClick={() => setStep("main")}
                className="text-white/50 hover:text-white text-sm mr-1"
              >
                ← 戻る
              </button>
            )}
            <span className="text-sm font-bold text-white">
              {step === "main"
                ? mainTitle
                : `${tempIcon} ${tempMain} › 小分類`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-white/40 hover:text-white text-xs px-2 py-1"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 -mx-1 px-1">
          {step === "main" ? (
            <div
              className={`grid gap-2 ${
                mainColumns === 2 ? "grid-cols-2" : "grid-cols-3"
              }`}
            >
              {categories.map((cat) => {
                const isSelected = currentMain === cat.main;
                return (
                  <button
                    key={cat.main}
                    type="button"
                    onClick={() => handleMainPick(cat.main)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? `${config.selectedBorder} ${config.selectedBg}`
                        : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                    }`}
                    style={isSelected ? { boxShadow: config.glow } : undefined}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-[11px] text-white/80 text-center leading-tight">
                      {cat.main}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {subs.map((sub) => {
                const isSelected =
                  currentMain === tempMain && currentSub === sub;
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => handleSubPick(sub)}
                    className={`p-3 rounded-xl border text-sm transition-all ${
                      isSelected
                        ? `${config.selectedBorder} ${config.selectedBg} text-white font-semibold`
                        : "border-white/10 bg-white/5 hover:bg-white/10 text-white/70"
                    }`}
                    style={isSelected ? { boxShadow: config.glow } : undefined}
                  >
                    {sub}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
