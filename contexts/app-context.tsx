"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { processFixedExpenses } from '@/lib/fixed-expenses';
import { CharacterId, isValidCharacterId } from '@/lib/characters';

export type UserType = "共同" | string;

export interface UserTheme {
  primary: string;
  secondary: string;
  background: string;
  textOnBg: string;
  cardBg: string;
  gradient: string;
  light: string;
  dark: string;
}

interface AppContextType {
  user: User | null;
  isAuthLoading: boolean;
  displayName: string;
  selectedUser: UserType;
  setSelectedUser: (user: UserType) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
  kakeiboTab: string;
  setKakeiboTab: (tab: string) => void;
  signOut: () => Promise<void>;
  theme: UserTheme;
  refreshTrigger: number;
  triggerRefresh: () => void;
  customThemeColor: string | null;
  setCustomThemeColor: (color: string | null) => void;
  saveCustomThemeColor: (color: string | null) => Promise<void>;
  jointThemeColor: string | null;
  setJointThemeColor: (color: string | null) => void;
  saveJointThemeColor: (color: string | null) => Promise<void>;
  characterId: CharacterId;
  setCharacterId: (id: CharacterId) => void;
  saveCharacterId: (id: CharacterId) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function generateSecondaryColor(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(s + 10, 100), Math.min(l + 10, 85));
}

// デフォルト色
const JOINT_DEFAULT = { primary: "#4f46e5", secondary: "#6366f1" };

const getDefaultPersonalColors = (userType: UserType): { primary: string; secondary: string } => {
  if (userType === "れん" || userType.includes("れん")) {
    return { primary: "#022fe3", secondary: "#2851f0" };
  } else {
    return { primary: "#7c9475", secondary: "#96b08e" };
  }
};

const buildTheme = (primary: string, secondary: string): UserTheme => ({
  primary,
  secondary,
  background: primary,
  textOnBg: "#f8fafc",
  cardBg: "rgba(15,23,42,0.75)",
  gradient: `from-[${primary}] to-[${secondary}]`,
  light: "from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900",
  dark: "from-slate-900/30 to-slate-800/30",
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserType>("__pending__");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('fixed');
  const [kakeiboTab, setKakeiboTab] = useState('analysis');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [customThemeColor, setCustomThemeColor] = useState<string | null>(null);
  const [jointThemeColor, setJointThemeColor] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<CharacterId>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("characterId");
      return isValidCharacterId(cached) ? cached : "none";
    }
    return "none";
  });
  const fixedExpensesProcessed = useRef(false);

  // ===== テーマ構築ロジック =====
  // 共同 → jointThemeColor > デフォルトパープル
  // 個人 → customThemeColor > デフォルト色
  // __pending__ → デフォルト色
  let primary: string;
  let secondary: string;
  if (selectedUser === "共同") {
    primary = jointThemeColor || JOINT_DEFAULT.primary;
    secondary = jointThemeColor ? generateSecondaryColor(jointThemeColor) : JOINT_DEFAULT.secondary;
  } else if (selectedUser === "__pending__") {
    primary = "#022fe3";
    secondary = "#2851f0";
  } else {
    const defaults = getDefaultPersonalColors(selectedUser);
    primary = customThemeColor || defaults.primary;
    secondary = customThemeColor ? generateSecondaryColor(customThemeColor) : defaults.secondary;
  }
  const theme = buildTheme(primary, secondary);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // DB からカスタムテーマカラーを安全に読み込み
  const loadThemeColors = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        setCustomThemeColor(null);
        setJointThemeColor(null);
        return;
      }

      const record = data as Record<string, unknown>;
      const tc = record["theme_color"];
      setCustomThemeColor(typeof tc === "string" && tc.startsWith("#") ? tc : null);
      const jtc = record["joint_theme_color"];
      setJointThemeColor(typeof jtc === "string" && jtc.startsWith("#") ? jtc : null);
      const cid = record["character_id"];
      const charId = isValidCharacterId(cid) ? cid : "none";
      setCharacterId(charId);
      localStorage.setItem("characterId", charId);
    } catch {
      setCustomThemeColor(null);
      setJointThemeColor(null);
    }
  }, []);

  // DB に個人テーマカラーを保存
  const saveCustomThemeColor = useCallback(async (color: string | null) => {
    if (!user) return;
    setCustomThemeColor(color);
    try {
      const { data: existing } = await supabase
        .from("user_settings")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        await supabase
          .from("user_settings")
          .update({ theme_color: color })
          .eq("user_id", user.id);
      } else if (color) {
        await supabase
          .from("user_settings")
          .insert({ user_id: user.id, theme_color: color });
      }
    } catch (err) {
      console.error("テーマカラー保存エラー:", err);
    }
  }, [user]);

  // DB に共同テーマカラーを保存
  const saveJointThemeColor = useCallback(async (color: string | null) => {
    if (!user) return;
    setJointThemeColor(color);
    try {
      const { data: existing } = await supabase
        .from("user_settings")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        await supabase
          .from("user_settings")
          .update({ joint_theme_color: color })
          .eq("user_id", user.id);
      } else if (color) {
        await supabase
          .from("user_settings")
          .insert({ user_id: user.id, joint_theme_color: color });
      }
    } catch (err) {
      console.error("共同テーマカラー保存エラー:", err);
    }
  }, [user]);

  // DB にキャラクター着せ替えIDを保存
  const saveCharacterId = useCallback(async (id: CharacterId) => {
    if (!user) return;
    setCharacterId(id);
    localStorage.setItem("characterId", id);
    try {
      const { data: existing } = await supabase
        .from("user_settings")
        .select("user_id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        await supabase
          .from("user_settings")
          .update({ character_id: id })
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("user_settings")
          .insert({ user_id: user.id, character_id: id });
      }
    } catch (err) {
      console.error("キャラクター保存エラー:", err);
    }
  }, [user]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user?.user_metadata?.display_name) {
        const name = user.user_metadata.display_name;
        setDisplayName(name);
        setSelectedUser(prev => prev === "__pending__" ? name : prev);
      }
      if (user) {
        loadThemeColors(user.id);
      }
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.user_metadata?.display_name) {
        const name = session.user.user_metadata.display_name;
        setDisplayName(name);
        setSelectedUser(prev => prev === "__pending__" ? name : prev);
      }
      if (session?.user) {
        loadThemeColors(session.user.id);
      }
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadThemeColors]);

  useEffect(() => {
    if (!user) return;
    // 本人のトランザクション + 共同トランザクションのみ監視
    const channel = supabase
      .channel('transactions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` },
        () => { triggerRefresh(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_type=eq.共同` },
        () => { triggerRefresh(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (user && !fixedExpensesProcessed.current) {
      fixedExpensesProcessed.current = true;
      processFixedExpenses(user.id).then((result) => {
        if (result.processed > 0) {
          console.log(`固定費自動反映: ${result.processed}件処理、${result.skipped}件スキップ`);
          triggerRefresh();
        }
        if (result.errors.length > 0) {
          console.error("固定費処理エラー:", JSON.stringify(result.errors, null, 2));
        }
      });
    }
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setDisplayName("");
    setCustomThemeColor(null);
    setJointThemeColor(null);
    setCharacterId("none");
    localStorage.removeItem("characterId");
  };

  return (
    <AppContext.Provider value={{
      user, isAuthLoading, displayName,
      selectedUser, setSelectedUser,
      isSettingsOpen, setIsSettingsOpen,
      settingsTab, setSettingsTab,
      kakeiboTab, setKakeiboTab,
      signOut, theme, refreshTrigger, triggerRefresh,
      customThemeColor, setCustomThemeColor, saveCustomThemeColor,
      jointThemeColor, setJointThemeColor, saveJointThemeColor,
      characterId, setCharacterId, saveCharacterId,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
