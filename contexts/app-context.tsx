"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ユーザー別テーマカラー
const getUserTheme = (userType: UserType): UserTheme => {
  if (userType === "共同") {
    return {
      primary: "#8b5cf6",
      secondary: "#a855f7",
      background: "#8b5cf6",
      textOnBg: "#f8fafc",
      cardBg: "rgba(0,0,0,0.25)",
      gradient: "from-purple-600 to-violet-600",
      light: "from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950",
      dark: "from-purple-900/30 to-violet-900/30",
    };
  } else if (userType === "れん" || userType.includes("れん")) {
    return {
      primary: "#022fe3",
      secondary: "#2851f0",
      background: "#022fe3",
      textOnBg: "#f8fafc",
      cardBg: "rgba(0,0,0,0.25)",
      gradient: "from-blue-700 to-indigo-600",
      light: "from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950",
      dark: "from-blue-900/30 to-indigo-900/30",
    };
  } else { // あかね
    return {
      primary: "#7c9475",
      secondary: "#96b08e",
      background: "#7c9475",
      textOnBg: "#f8fafc",
      cardBg: "rgba(0,0,0,0.22)",
      gradient: "from-green-600 to-emerald-500",
      light: "from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950",
      dark: "from-green-900/30 to-emerald-900/30",
    };
  }
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserType>("共同");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const fixedExpensesProcessed = useRef(false);
  const theme = getUserTheme(selectedUser);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    // 初回のユーザー情報取得
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user?.user_metadata?.display_name) {
        setDisplayName(user.user_metadata.display_name);
      }
      setIsAuthLoading(false);
    });

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.user_metadata?.display_name) {
        setDisplayName(session.user.user_metadata.display_name);
      }
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
          console.error("固定費処理エラー:", result.errors);
        }
      });
    }
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setDisplayName("");
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
      triggerRefresh
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
