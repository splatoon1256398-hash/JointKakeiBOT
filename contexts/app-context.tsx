"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { processFixedExpenses } from '@/lib/fixed-expenses';
import { CharacterId, isValidCharacterId, CHARACTER_REGISTRY } from '@/lib/characters';

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

/**
 * 全画面で共有する正規化済みカテゴリ。
 * 各 useEffect で別々に fetch していたのを AppContext 1 本に集約する。
 */
export interface Category {
  main: string;      // ← DB の main_category
  icon: string;
  subs: string[];    // ← DB の subcategories
  sortOrder: number;
}

const CATEGORIES_CACHE_KEY = "categories-v1";

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
  // ===== 集約済みカテゴリ（Phase 2） =====
  categories: Category[];
  categoriesMap: Record<string, Category>;
  categoryIcons: Record<string, string>;
  getCategoryIcon: (main: string) => string;
  getSubcategories: (main: string) => string[];
  refreshCategories: () => Promise<void>;
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
  // カテゴリ: localStorage から即座に hydrate（SWR 的挙動）→ 後で fetch で上書き
  const [categories, setCategories] = useState<Category[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed as Category[];
      }
    } catch {
      // ignore
    }
    return [];
  });
  const fixedExpensesProcessed = useRef(false);

  // ===== テーマ構築ロジック =====
  // 共同 → jointThemeColor > デフォルトパープル
  // 個人 → customThemeColor > デフォルト色
  // __pending__ → デフォルト色
  const { primary, secondary } = useMemo(() => {
    if (selectedUser === "共同") {
      return {
        primary: jointThemeColor || JOINT_DEFAULT.primary,
        secondary: jointThemeColor
          ? generateSecondaryColor(jointThemeColor)
          : JOINT_DEFAULT.secondary,
      };
    }
    if (selectedUser === "__pending__") {
      return { primary: "#022fe3", secondary: "#2851f0" };
    }
    const defaults = getDefaultPersonalColors(selectedUser);
    return {
      primary: customThemeColor || defaults.primary,
      secondary: customThemeColor
        ? generateSecondaryColor(customThemeColor)
        : defaults.secondary,
    };
  }, [selectedUser, jointThemeColor, customThemeColor]);
  const theme = useMemo(() => buildTheme(primary, secondary), [primary, secondary]);

  // ===== 派生: カテゴリの Map / アイコン一覧 =====
  const categoriesMap = useMemo<Record<string, Category>>(() => {
    const map: Record<string, Category> = {};
    for (const c of categories) map[c.main] = c;
    return map;
  }, [categories]);

  const categoryIcons = useMemo<Record<string, string>>(() => {
    const icons: Record<string, string> = {};
    for (const c of categories) icons[c.main] = c.icon;
    return icons;
  }, [categories]);

  const getCategoryIcon = useCallback(
    (main: string) => categoriesMap[main]?.icon || "📦",
    [categoriesMap]
  );

  const getSubcategories = useCallback(
    (main: string) => categoriesMap[main]?.subs || ["その他"],
    [categoriesMap]
  );

  // ===== カテゴリ取得: 1 回だけ起動時に fetch、settings CRUD 時に手動 refresh =====
  const refreshCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("main_category, icon, subcategories, sort_order")
      .order("sort_order");
    if (error || !data) return;
    const normalized: Category[] = data.map((row) => ({
      main: row.main_category,
      icon: row.icon || "📦",
      subs: row.subcategories || ["その他"],
      sortOrder: row.sort_order ?? 0,
    }));
    setCategories(normalized);
    try {
      localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(normalized));
    } catch {
      // storage full / disabled -> ignore
    }
  }, []);

  useEffect(() => {
    // 起動時 1 回だけ fetch（キャッシュは state の初期値で既に入っている）
    refreshCategories();
  }, [refreshCategories]);

  // ===== キャラクター画像の事前 preload =====
  // ハチワレ等のキャラクターを使っている場合、scanning / success などの
  // 「使う直前に表示される」画像をブラウザキャッシュに先読みしておく。
  // → ダイアログを開いた瞬間にハチワレが即表示される
  useEffect(() => {
    if (characterId === "none" || typeof window === "undefined") return;
    const config = CHARACTER_REGISTRY[characterId];
    if (!config) return;
    const urlsToPreload: string[] = [
      config.assets.scanning,
      config.assets.success || "",
      config.assets.empty,
    ].filter(Boolean);
    for (const url of urlsToPreload) {
      const img = new window.Image();
      img.src = url;
    }
  }, [characterId]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

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
    // Phase 6-D: ここで user_id フィルタで自分の書き込みを除外したくなるが、
    // multi-device (PC + スマホ) で同じユーザーが使う場合にデバイス B 側で
    // 同期が届かなくなる問題があるため、payload.new.user_id ベースの除外は
    // 避け、元の「本人 transactions + 共同 transactions を監視」に留める。
    // (真の重複除去は optimistic id の Set で行う必要があり別タスク)
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
  }, [triggerRefresh, user]);

  // Phase 6-C: 固定費の自動反映は Vercel Cron (毎日 00:00 JST) に移行済み。
  // 起動時のクライアント側処理は、Cron が失敗した場合のフォールバックとして残す。
  // ただし localStorage で「最後に成功した日付」を記録し、同じ日に既に走っていれば skip して
  // 起動時のフェッチ/処理コストをゼロにする。
  useEffect(() => {
    if (!user || fixedExpensesProcessed.current) return;
    fixedExpensesProcessed.current = true;

    const STORAGE_KEY = `fixed-expenses-last-run:${user.id}`;
    const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD (JST)

    if (typeof window !== "undefined") {
      const lastRun = localStorage.getItem(STORAGE_KEY);
      if (lastRun === todayJST) {
        // 今日すでに処理済み (Cron か client いずれか) → skip
        return;
      }
    }

    processFixedExpenses(user.id).then((result) => {
      if (result.processed > 0) {
        console.log(`固定費自動反映 (client fallback): ${result.processed}件処理、${result.skipped}件スキップ`);
        triggerRefresh();
      }
      if (result.errors.length > 0) {
        console.error("固定費処理エラー:", JSON.stringify(result.errors, null, 2));
        return; // エラー時は localStorage 更新せず次回再試行
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, todayJST);
      }
    });
  }, [triggerRefresh, user]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setDisplayName("");
    setCustomThemeColor(null);
    setJointThemeColor(null);
    setCharacterId("none");
    localStorage.removeItem("characterId");
  }, []);

  const contextValue = useMemo(() => ({
      user, isAuthLoading, displayName,
      selectedUser, setSelectedUser,
      isSettingsOpen, setIsSettingsOpen,
      settingsTab, setSettingsTab,
      kakeiboTab, setKakeiboTab,
      signOut, theme, refreshTrigger, triggerRefresh,
      customThemeColor, setCustomThemeColor, saveCustomThemeColor,
      jointThemeColor, setJointThemeColor, saveJointThemeColor,
      characterId, setCharacterId, saveCharacterId,
      // Phase 2: 集約済みカテゴリ
      categories, categoriesMap, categoryIcons,
      getCategoryIcon, getSubcategories, refreshCategories,
    }), [
      user,
      isAuthLoading,
      displayName,
      selectedUser,
      isSettingsOpen,
      settingsTab,
      kakeiboTab,
      signOut,
      theme,
      refreshTrigger,
      triggerRefresh,
      customThemeColor,
      saveCustomThemeColor,
      jointThemeColor,
      saveJointThemeColor,
      characterId,
      saveCharacterId,
      categories,
      categoriesMap,
      categoryIcons,
      getCategoryIcon,
      getSubcategories,
      refreshCategories,
    ]);

  return (
    <AppContext.Provider value={contextValue}>
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
