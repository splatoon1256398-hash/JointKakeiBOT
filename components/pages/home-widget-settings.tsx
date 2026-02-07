"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, Loader2, Save } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { supabase } from "@/lib/supabase";
import { WIDGET_TYPES } from "@/lib/widgets";

interface WidgetSlot {
  type: string;
  // 追加設定
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
  const [categories, setCategories] = useState<{ main: string; icon: string; subs: string[] }[]>([]);
  const [savingGoals, setSavingGoals] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadSettings();
    loadCategories();
    loadSavingGoals();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("home_widgets")
        .eq("user_id", user.id)
        .single();

      if (data?.home_widgets && Array.isArray(data.home_widgets)) {
        setSlots(data.home_widgets as WidgetSlot[]);
      }
    } catch {
      // 未設定の場合はデフォルトのまま
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

  const updateSlot = (index: number, updates: Partial<WidgetSlot>) => {
    setSlots(prev => {
      const newSlots = [...prev];
      newSlots[index] = { ...newSlots[index], ...updates };
      return newSlots;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: user.id,
          home_widgets: slots,
        }, { onConflict: "user_id" });

      if (error) throw error;
      alert("ホーム表示設定を保存しました！");
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
        {slots.map((slot, index) => (
          <div key={index} className="rounded-xl bg-black/15 border border-white/5 p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-white/60">カード {index + 1}</span>
            </div>

            {/* ウィジェットタイプ選択 */}
            <select
              value={slot.type}
              onChange={(e) => updateSlot(index, { type: e.target.value, categoryMain: undefined, categorySub: undefined, savingGoalId: undefined })}
              className="w-full h-9 rounded-lg bg-black/20 border border-white/10 text-white text-sm px-3 appearance-none"
            >
              {WIDGET_TYPES.map(wt => (
                <option key={wt.value} value={wt.value}>{wt.label}</option>
              ))}
            </select>

            {/* カテゴリ選択（category_budget用） */}
            {slot.type === "category_budget" && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={slot.categoryMain || ""}
                  onChange={(e) => {
                    updateSlot(index, { categoryMain: e.target.value, categorySub: undefined });
                  }}
                  className="h-8 rounded-lg bg-black/20 border border-white/10 text-white text-xs px-2 appearance-none"
                >
                  <option value="">大カテゴリー</option>
                  {categories.map(c => (
                    <option key={c.main} value={c.main}>{c.icon} {c.main}</option>
                  ))}
                </select>
                <select
                  value={slot.categorySub || ""}
                  onChange={(e) => updateSlot(index, { categorySub: e.target.value })}
                  className="h-8 rounded-lg bg-black/20 border border-white/10 text-white text-xs px-2 appearance-none"
                >
                  <option value="">全体</option>
                  {(categories.find(c => c.main === slot.categoryMain)?.subs || []).map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 貯金目標選択（saving_progress用） */}
            {slot.type === "saving_progress" && savingGoals.length > 0 && (
              <select
                value={slot.savingGoalId || ""}
                onChange={(e) => updateSlot(index, { savingGoalId: e.target.value })}
                className="w-full h-8 rounded-lg bg-black/20 border border-white/10 text-white text-xs px-2 appearance-none"
              >
                <option value="">全体の進捗</option>
                {savingGoals.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}

            {/* 給料日設定（payday用） */}
            {slot.type === "payday" && (
              <div className="grid grid-cols-2 gap-2">
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
                  <select
                    value={slot.paydayShift || "before"}
                    onChange={(e) => updateSlot(index, { paydayShift: e.target.value as "before" | "after" })}
                    className="w-full h-8 rounded-lg bg-black/20 border border-white/10 text-white text-xs px-2 appearance-none"
                  >
                    <option value="before">前倒し</option>
                    <option value="after">後ろ倒し</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full p-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
      >
        {isSaving ? (
          <><Loader2 className="h-4 w-4 animate-spin" />保存中...</>
        ) : (
          <><Save className="h-4 w-4" />設定を保存</>
        )}
      </button>
    </div>
  );
}
