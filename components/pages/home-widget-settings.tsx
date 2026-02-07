"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LayoutGrid, Loader2, Save, Check,
  UtensilsCrossed, Coffee, PiggyBank, Calendar,
  Banknote, ShoppingCart, TrendingDown, HandCoins,
} from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { supabase } from "@/lib/supabase";
import { WIDGET_TYPES } from "@/lib/widgets";

interface WidgetSlot {
  type: string;
  categoryMain?: string;
  categorySub?: string;
  savingGoalId?: string;
  payday?: number;
  paydayShift?: "before" | "after";
}

const DEFAULT_SLOTS: WidgetSlot[] = [
  { type: "food_budget" },
  { type: "dining_count" },
  { type: "saving_progress" },
  { type: "payday", payday: 25, paydayShift: "before" },
];

// ウィジェットのアイコンマッピング
const WIDGET_ICONS: Record<string, any> = {
  food_budget: UtensilsCrossed,
  dining_count: Coffee,
  saving_progress: PiggyBank,
  payday: Calendar,
  category_budget: ShoppingCart,
  no_money_day: Banknote,
  total_expense: TrendingDown,
  total_income: HandCoins,
};

// ウィジェットの色マッピング
const WIDGET_COLORS: Record<string, string> = {
  food_budget: "#f97316",
  dining_count: "#ec4899",
  saving_progress: "#10b981",
  payday: "#3b82f6",
  category_budget: "#f59e0b",
  no_money_day: "#14b8a6",
  total_expense: "#ef4444",
  total_income: "#059669",
};

export function HomeWidgetSettings() {
  const { theme, user } = useApp();
  const [slots, setSlots] = useState<WidgetSlot[]>(DEFAULT_SLOTS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [categories, setCategories] = useState<{ main: string; icon: string; subs: string[] }[]>([]);
  const [savingGoals, setSavingGoals] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (user) {
      loadSettings();
      loadCategories();
      loadSavingGoals();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("user_settings")
        .select("home_widgets")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("ウィジェット設定取得エラー:", error);
      }

      if (data?.home_widgets && Array.isArray(data.home_widgets)) {
        setSlots(data.home_widgets as WidgetSlot[]);
      }
    } catch (err) {
      console.error("ウィジェット設定読込エラー:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from("categories")
      .select("main_category, icon, subcategories")
      .order("sort_order");
    if (data) {
      setCategories(data.map(d => ({ main: d.main_category, icon: d.icon, subs: d.subcategories || [] })));
    }
  };

  const loadSavingGoals = async () => {
    const { data } = await supabase
      .from("saving_goals")
      .select("id, goal_name")
      .order("created_at", { ascending: false });
    if (data) {
      setSavingGoals(data.map(d => ({ id: d.id, name: d.goal_name })));
    }
  };

  const updateSlot = useCallback((index: number, updates: Partial<WidgetSlot>) => {
    setSlots(prev => {
      const newSlots = [...prev];
      newSlots[index] = { ...newSlots[index], ...updates };
      return newSlots;
    });
  }, []);

  const selectWidgetType = useCallback((index: number, type: string) => {
    setSlots(prev => {
      const newSlots = [...prev];
      newSlots[index] = { type };
      if (type === "payday") {
        newSlots[index].payday = 25;
        newSlots[index].paydayShift = "before";
      }
      return newSlots;
    });
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const { data: existing } = await supabase
        .from("user_settings")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      let error;
      if (existing) {
        const result = await supabase
          .from("user_settings")
          .update({ home_widgets: slots as unknown as Record<string, unknown>[] })
          .eq("user_id", user.id);
        error = result.error;
      } else {
        const result = await supabase
          .from("user_settings")
          .insert({ user_id: user.id, home_widgets: slots as unknown as Record<string, unknown>[] });
        error = result.error;
      }

      if (error) throw error;
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error("保存エラー:", error);
      alert("保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" style={{ color: theme.primary }} />
          ホーム表示設定
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          ダッシュボードの4つの小カードに表示する内容を選択
        </p>
      </div>

      <div className="space-y-5">
        {slots.map((slot, index) => {
          const IconForSlot = WIDGET_ICONS[slot.type];

          return (
            <div key={index} className="space-y-2">
              {/* スロットヘッダー */}
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: theme.primary }}
                >
                  {index + 1}
                </div>
                <span className="text-xs font-semibold text-white/70">
                  カード {index + 1}
                  {slot.type && (
                    <span className="text-white/40 ml-1">
                      — {WIDGET_TYPES.find(w => w.value === slot.type)?.label}
                    </span>
                  )}
                </span>
              </div>

              {/* ウィジェット選択カードグリッド（常に表示） */}
              <div className="grid grid-cols-4 gap-1.5">
                {WIDGET_TYPES.map(wt => {
                  const WIcon = WIDGET_ICONS[wt.value];
                  const color = WIDGET_COLORS[wt.value] || theme.primary;
                  const isSelected = slot.type === wt.value;

                  return (
                    <button
                      key={wt.value}
                      type="button"
                      onClick={() => selectWidgetType(index, wt.value)}
                      className={`relative flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                        isSelected
                          ? "bg-white/10 ring-2 scale-[1.02]"
                          : "bg-black/10 border border-white/5 hover:bg-white/5"
                      }`}
                      style={isSelected ? { boxShadow: `0 0 0 2px ${color}` } : {}}
                    >
                      {isSelected && (
                        <div
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: color }}
                        >
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        {WIcon && <WIcon className="h-3.5 w-3.5" style={{ color }} />}
                      </div>
                      <span className="text-[9px] leading-tight text-center text-white/60 font-medium">
                        {wt.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* サブ設定（カテゴリ / 貯金 / 給料日） */}
              {slot.type === "category_budget" && (
                <div className="pl-2 border-l-2 ml-3 space-y-1" style={{ borderColor: `${theme.primary}40` }}>
                  <p className="text-[10px] text-white/40">対象カテゴリ</p>
                  <div className="flex flex-wrap gap-1">
                    {categories.map(c => (
                      <button
                        key={c.main}
                        type="button"
                        onClick={() => updateSlot(index, { categoryMain: c.main, categorySub: undefined })}
                        className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                          slot.categoryMain === c.main
                            ? "text-white font-semibold"
                            : "text-white/40 bg-white/5 hover:bg-white/10"
                        }`}
                        style={slot.categoryMain === c.main ? { backgroundColor: theme.primary } : {}}
                      >
                        {c.icon} {c.main}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {slot.type === "saving_progress" && savingGoals.length > 0 && (
                <div className="pl-2 border-l-2 ml-3 space-y-1" style={{ borderColor: `${theme.primary}40` }}>
                  <p className="text-[10px] text-white/40">対象の貯金目標</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => updateSlot(index, { savingGoalId: undefined })}
                      className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                        !slot.savingGoalId ? "text-white font-semibold" : "text-white/40 bg-white/5"
                      }`}
                      style={!slot.savingGoalId ? { backgroundColor: `${theme.primary}50` } : {}}
                    >
                      全体
                    </button>
                    {savingGoals.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => updateSlot(index, { savingGoalId: g.id })}
                        className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                          slot.savingGoalId === g.id ? "text-white font-semibold" : "text-white/40 bg-white/5"
                        }`}
                        style={slot.savingGoalId === g.id ? { backgroundColor: `${theme.primary}50` } : {}}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {slot.type === "payday" && (
                <div className="pl-2 border-l-2 ml-3" style={{ borderColor: `${theme.primary}40` }}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/40 block mb-0.5">給料日</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={slot.payday || 25}
                        onChange={(e) => updateSlot(index, { payday: Number(e.target.value) })}
                        className="w-full h-7 rounded-md bg-black/20 border border-white/10 text-white text-xs px-2"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/40 block mb-0.5">休日ずらし</label>
                      <div className="flex gap-1">
                        {([
                          { value: "before" as const, label: "前倒し" },
                          { value: "after" as const, label: "後ろ倒し" },
                        ]).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateSlot(index, { paydayShift: opt.value })}
                            className={`flex-1 h-7 rounded-md text-[10px] font-semibold transition-all ${
                              (slot.paydayShift || "before") === opt.value
                                ? "text-white"
                                : "text-white/40 bg-white/5"
                            }`}
                            style={(slot.paydayShift || "before") === opt.value ? { backgroundColor: theme.primary } : {}}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* スロット間の区切り線 */}
              {index < slots.length - 1 && (
                <div className="border-t border-white/5 mt-1" />
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full p-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: saveSuccess ? "#10b981" : `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
      >
        {isSaving ? (
          <><Loader2 className="h-4 w-4 animate-spin" />保存中...</>
        ) : saveSuccess ? (
          <><Check className="h-4 w-4" />保存しました！</>
        ) : (
          <><Save className="h-4 w-4" />設定を保存</>
        )}
      </button>
    </div>
  );
}
