"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { AppProvider, useApp } from "@/contexts/app-context";
import { SplashScreen } from "@/components/splash-screen";
import { CommonHeader } from "@/components/common-header";
import { BottomNav, type NavPage } from "@/components/bottom-nav";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

function PageLoading({ label = "読み込み中..." }: { label?: string }) {
  return (
    <div className="flex min-h-[30vh] items-center justify-center text-sm text-white/60">
      {label}
    </div>
  );
}

const Login = dynamic(
  () => import("@/components/auth/login").then((module) => module.Login),
  { loading: () => <PageLoading label="ログイン画面を読み込み中..." /> }
);
const Dashboard = dynamic(
  () => import("@/components/pages/dashboard").then((module) => module.Dashboard),
  { loading: () => <PageLoading label="ダッシュボードを読み込み中..." /> }
);
const Kakeibo = dynamic(
  () => import("@/components/pages/kakeibo").then((module) => module.Kakeibo),
  { loading: () => <PageLoading label="家計簿を読み込み中..." /> }
);
const Savings = dynamic(
  () => import("@/components/pages/savings").then((module) => module.Savings),
  { loading: () => <PageLoading label="貯金ページを読み込み中..." /> }
);
const Chat = dynamic(
  () => import("@/components/pages/chat").then((module) => module.Chat),
  { loading: () => <PageLoading label="チャットを読み込み中..." /> }
);
const SettingsModal = dynamic(
  () => import("@/components/settings-modal").then((module) => module.SettingsModal),
  { loading: () => null }
);
const RecordMenuDialog = dynamic(
  () => import("@/components/record-menu-dialog").then((module) => module.RecordMenuDialog),
  { loading: () => null }
);
const AddExpenseDialog = dynamic(
  () => import("@/components/add-expense-dialog").then((module) => module.AddExpenseDialog),
  { loading: () => null }
);
const AddIncomeDialog = dynamic(
  () => import("@/components/add-income-dialog").then((module) => module.AddIncomeDialog),
  { loading: () => null }
);
const AddSavingDialog = dynamic(
  () => import("@/components/add-saving-dialog").then((module) => module.AddSavingDialog),
  { loading: () => null }
);

function AppContent() {
  const {
    user,
    isAuthLoading,
    isSettingsOpen,
    selectedUser,
    theme,
    setKakeiboTab,
  } = useApp();
  const { assets: charAssets, isActive: charActive } = useCharacter();
  const [currentPage, setCurrentPage] = useState<NavPage>("dashboard");
  const [isRecordMenuOpen, setIsRecordMenuOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [isAddSavingOpen, setIsAddSavingOpen] = useState(false);
  const [loginKey, setLoginKey] = useState(0);
  const [splashFadeOut, setSplashFadeOut] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // スプラッシュのフェードアウト管理
  // fadeOut を true にすると .animate-splash-out (CSS transition) が走る。
  // 150ms の固定 setTimeout をやめて、アニメーション完了時に showSplash=false にする。
  useEffect(() => {
    if (!isAuthLoading) {
      setSplashFadeOut(true);
    }
  }, [isAuthLoading]);

  const handleSplashAnimationEnd = () => {
    if (splashFadeOut) setShowSplash(false);
  };

  const handleRecordClick = () => {
    setIsRecordMenuOpen(true);
  };

  const handleSelectExpense = () => {
    setIsAddExpenseOpen(true);
  };

  const handleSelectIncome = () => {
    setIsAddIncomeOpen(true);
  };

  const handleSelectSaving = () => {
    setIsAddSavingOpen(true);
  };

  const handleLoginSuccess = () => {
    setLoginKey(prev => prev + 1);
  };

  const handleNavigateToAnalysis = () => {
    setCurrentPage("kakeibo");
  };

  const handleNavigateToHistory = () => {
    setKakeiboTab('history');
    setCurrentPage("kakeibo");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page");
    const tab = params.get("tab");

    if (page === "dashboard" || page === "kakeibo" || page === "savings" || page === "chat") {
      setCurrentPage(page);
    }
    if (tab === "analysis" || tab === "history") {
      setKakeiboTab(tab);
      setCurrentPage("kakeibo");
    }
  }, [setKakeiboTab]);

  // ===== ページチャンクの事前 preload =====
  // 初回タブ切替時に「家計簿を読み込み中...」が数秒出るのを防ぐため、
  // ユーザーがログイン済みになった後、バックグラウンドで全ページの JS chunk を fetch。
  // ネットワークに少しだけ追加負荷がかかるが、UX の体感は大幅改善。
  // requestIdleCallback があればアイドル時間に実行 (他の処理を邪魔しない)。
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const preloadAll = () => {
      // dynamic import の Promise を発行するだけで chunk が fetch される
      import("@/components/pages/dashboard").catch(() => {});
      import("@/components/pages/kakeibo").catch(() => {});
      import("@/components/pages/savings").catch(() => {});
      import("@/components/pages/chat").catch(() => {});
      // よく使うダイアログも先読み
      import("@/components/record-menu-dialog").catch(() => {});
      import("@/components/add-expense-dialog").catch(() => {});
      import("@/components/add-income-dialog").catch(() => {});
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(preloadAll, { timeout: 2000 });
    } else {
      // Safari など requestIdleCallback 非対応環境では setTimeout で代替
      setTimeout(preloadAll, 500);
    }
  }, [user]);

  // スプラッシュ表示中
  if (showSplash) {
    return <SplashScreen fadeOut={splashFadeOut} onFadeOutEnd={handleSplashAnimationEnd} />;
  }

  // 未認証
  if (!user) {
    return <Login key={loginKey} onLoginSuccess={handleLoginSuccess} />;
  }

  // メインUI
  return (
    <div
      className="min-h-screen min-h-[100dvh] transition-colors duration-500"
      style={{ backgroundColor: theme.background }}
    >
      {/* 背景ウォーターマーク（キャラ着せ替え時） */}
      {charActive && charAssets && (
        <div className="fixed inset-0 pointer-events-none z-0 flex items-end justify-end opacity-[0.12] pr-4 pb-28">
          <CharacterImage
            src={charAssets.watermark}
            alt=""
            width={200}
            height={200}
            className="select-none"
            fallback={null}
          />
        </div>
      )}

      {/* 共通ヘッダー */}
      <CommonHeader />

      {/* メインコンテンツ */}
      <main className="container mx-auto px-3 pt-0 pb-6 max-w-lg">
        {currentPage === "dashboard" && <Dashboard onNavigateToAnalysis={handleNavigateToAnalysis} onNavigateToHistory={handleNavigateToHistory} />}
        {currentPage === "kakeibo" && <Kakeibo />}
        {currentPage === "savings" && <Savings />}
        {currentPage === "chat" && <Chat />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onRecordClick={handleRecordClick}
      />

      {isSettingsOpen && <SettingsModal />}

      {isRecordMenuOpen && (
        <RecordMenuDialog
          open={isRecordMenuOpen}
          onOpenChange={setIsRecordMenuOpen}
          onSelectExpense={handleSelectExpense}
          onSelectIncome={handleSelectIncome}
          onSelectSaving={handleSelectSaving}
        />
      )}

      {isAddExpenseOpen && (
        <AddExpenseDialog
          open={isAddExpenseOpen}
          onOpenChange={setIsAddExpenseOpen}
          selectedUser={selectedUser}
        />
      )}

      {isAddIncomeOpen && (
        <AddIncomeDialog
          open={isAddIncomeOpen}
          onOpenChange={setIsAddIncomeOpen}
          selectedUser={selectedUser}
        />
      )}

      {isAddSavingOpen && (
        <AddSavingDialog
          open={isAddSavingOpen}
          onOpenChange={setIsAddSavingOpen}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
