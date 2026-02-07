"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutGrid, Loader2, Save, Check, ChevronDown, ChevronUp } from "lucide-react";
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

export function HomeWidgetSettings() {
  const { theme, user } = useApp();
  const [slots, setSlots] = useState<WidgetSlot[]>(DEFAULT_SLOTS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [categories, setCategories] = useState<{ main: string; icon: string; subs: string[] }[]>([]);
  const [savingGoals, setSavingGoals] = useState<{ id: string; name: string }[]>([]);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

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
      // payday のデフォルト値
      if (type === "payday") {
        newSlots[index].payday = 25;
        newSlots[index].paydayShift = "before";
      }
      return newSlots;
    });
    setExpandedSlot(null);
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      // まず既存の行があるか確認
      const { data: existing } = await supabase
        .from("user_settings")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      let error;
      if (existing) {
        // UPDATE
        const result = await supabase
          .from("user_settings")
          .update({ home_widgets: slots as unknown as Record<string, unknown>[] })
          .eq("user_id", user.id);
        error = result.error;
      } else {
        // INSERT
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
          ダッシュボードの4つの小カードに表示する内容を選択できます
        </p>
      </div>

      <div className="space-y-3">
        {slots.map((slot, index) => {
          const currentWidget = WIDGET_TYPES.find(w => w.value === slot.type);
          const isExpanded = expandedSlot === index;

          return (
            <div key={index} className="rounded-xl bg-black/15 border border-white/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white/60">カード {index + 1}</span>
              </div>

              {/* 現在の選択 + 展開トグル */}
              <button
                type="button"
                onClick={() => setExpandedSlot(isExpanded ? null : index)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-black/20 border border-white/10 hover:border-white/20 transition-colors"
              >
                <span className="text-sm text-white font-medium">
                  {currentWidget?.label || "未選択"}
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-white/40" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-white/40" />
                )}
              </button>

              {/* 展開時: ウィジェットタイプ選択グリッド */}
              {isExpanded && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {WIDGET_TYPES.map(wt => (
                    <button
                      key={wt.value}
                      type="button"
                      onClick={() => selectWidgetType(index, wt.value)}
                      className={`p-2.5 rounded-lg text-xs font-semibold text-left transition-all flex items-center gap-2 ${
                        slot.type === wt.value
                          ? "text-white border-2"
                          : "text-white/60 bg-black/15 border border-white/5 hover:bg-white/5"
                      }`}
                      style={
                        slot.type === wt.value
                          ? { backgroundColor: `${theme.primary}30`, borderColor: theme.primary }
                          : {}
                      }
                    >
                      {slot.type === wt.value && <Check className="h-3 w-3 flex-shrink-0" style={{ color: theme.primary }} />}
                      <span className="truncate">{wt.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* カテゴリ選択（category_budget用） */}
              {slot.type === "category_budget" && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] text-white/40">対象カテゴリ</p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map(c => (
                      <button
                        key={c.main}
                        type="button"
                        onClick={() => updateSlot(index, { categoryMain: c.main, categorySub: undefined })}
                        className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                          slot.categoryMain === c.main
                            ? "text-white font-semibold"
                            : "text-white/50 bg-white/5 hover:bg-white/10"
                        }`}
                        style={slot.categoryMain === c.main ? { backgroundColor: theme.primary } : {}}
                      >
                        {c.icon} {c.main}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 貯金目標選択（saving_progress用） */}
              {slot.type === "saving_progress" && savingGoals.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] text-white/40">対象の貯金目標</p>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => updateSlot(index, { savingGoalId: undefined })}
                      className={`w-full p-2 rounded-lg text-xs text-left transition-all ${
                        !slot.savingGoalId
                          ? "text-white font-semibold"
                          : "text-white/50 bg-white/5 hover:bg-white/10"
                      }`}
                      style={!slot.savingGoalId ? { backgroundColor: `${theme.primary}30` } : {}}
                    >
                      全体の進捗
                    </button>
                    {savingGoals.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => updateSlot(index, { savingGoalId: g.id })}
                        className={`w-full p-2 rounded-lg text-xs text-left transition-all ${
                          slot.savingGoalId === g.id
                            ? "text-white font-semibold"
                            : "text-white/50 bg-white/5 hover:bg-white/10"
                        }`}
                        style={slot.savingGoalId === g.id ? { backgroundColor: `${theme.primary}30` } : {}}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 給料日設定（payday用） */}
              {slot.type === "payday" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] text-white/40 block mb-0.5">給料日（日）</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={slot.payday || 25}
                      onChange={(e) => updateSlot(index, { payday: Number(e.target.value) })}
                      className="w-full h-8 rounded-lg bg-black/20 border border-white/10 text-white text-xs px-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 block mb-0.5">休日のずらし</label>
                    <div className="flex gap-1">
                      {[
                        { value: "before" as const, label: "前倒し" },
                        { value: "after" as const, label: "後ろ倒し" },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateSlot(index, { paydayShift: opt.value })}
                          className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-all ${
                            (slot.paydayShift || "before") === opt.value
                              ? "text-white"
                              : "text-white/50 bg-white/5"
                          }`}
                          style={(slot.paydayShift || "before") === opt.value ? { backgroundColor: theme.primary } : {}}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
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
