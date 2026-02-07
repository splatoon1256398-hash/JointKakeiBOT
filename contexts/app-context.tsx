"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { processFixedExpenses } from '@/lib/fixed-expenses';

export type UserType = "共同" | string; // "共同" or ユーザー名

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
  signOut: () => Promise<void>;
  theme: UserTheme;
  refreshTrigger: number;
  triggerRefresh: () => void;
  customThemeColor: string | null;
  setCustomThemeColor: (color: string | null) => void;
  saveCustomThemeColor: (color: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * HEX色から lighter/darker バリエーションを生成
 */
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

// ユーザー別テーマカラー
const getDefaultColors = (userType: UserType): { primary: string; secondary: string } => {
  if (userType === "共同") {
    return { primary: "#8b5cf6", secondary: "#a855f7" };
  } else if (userType === "れん" || userType.includes("れん")) {
    return { primary: "#022fe3", secondary: "#2851f0" };
  } else { // あかね
    return { primary: "#7c9475", secondary: "#96b08e" };
  }
};

const buildTheme = (primary: string, secondary: string): UserTheme => {
  return {
    primary,
    secondary,
    background: primary,
    textOnBg: "#f8fafc",
    cardBg: "rgba(15,23,42,0.75)",
    gradient: `from-[${primary}] to-[${secondary}]`,
    light: "from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900",
    dark: "from-slate-900/30 to-slate-800/30",
  };
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserType>("共同");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [customThemeColor, setCustomThemeColor] = useState<string | null>(null);
  const fixedExpensesProcessed = useRef(false);

  // テーマの構築: カスタムカラーがあればそれを優先
  const defaults = getDefaultColors(selectedUser);
  const primary = customThemeColor || defaults.primary;
  const secondary = customThemeColor ? generateSecondaryColor(customThemeColor) : defaults.secondary;
  const theme = buildTheme(primary, secondary);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // DB からカスタムテーマカラーを読み込み
  const loadCustomThemeColor = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("theme_color")
        .eq("user_id", userId)
        .single();
      if (data?.theme_color) {
        setCustomThemeColor(data.theme_color);
      }
    } catch {
      // 未設定の場合はデフォルト
    }
  }, []);

  // DB にカスタムテーマカラーを保存
  const saveCustomThemeColor = useCallback(async (color: string) => {
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
      } else {
        await supabase
          .from("user_settings")
          .insert({ user_id: user.id, theme_color: color });
      }
    } catch (err) {
      console.error("テーマカラー保存エラー:", err);
    }
  }, [user]);

  useEffect(() => {
    // 初回のユーザー情報取得
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user?.user_metadata?.display_name) {
        setDisplayName(user.user_metadata.display_name);
      }
      if (user) {
        loadCustomThemeColor(user.id);
      }
      setIsAuthLoading(false);
    });

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.user_metadata?.display_name) {
        setDisplayName(session.user.user_metadata.display_name);
      }
      if (session?.user) {
        loadCustomThemeColor(session.user.id);
      }
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadCustomThemeColor]);

  // Supabase Realtime: transactions テーブルの INSERT を購読
  useEffect(() => {
    const channel = supabase
      .channel('transactions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        () => {
          triggerRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 固定費の自動反映処理（アプリ起動時に1回だけ実行）
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
  };

  return (
    <AppContext.Provider value={{ 
      user,
      isAuthLoading,
      displayName,
      selectedUser, 
      setSelectedUser, 
      isSettingsOpen, 
      setIsSettingsOpen,
      signOut,
      theme,
      refreshTrigger,
      triggerRefresh,
      customThemeColor,
      setCustomThemeColor,
      saveCustomThemeColor,
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
