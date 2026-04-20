"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { AppProvider, useApp } from "@/contexts/app-context";
import { Login } from "@/components/auth/login";
import { SplashScreen } from "@/components/splash-screen";
import { CommonHeader } from "@/components/common-header";
import { BottomNav, type NavPage } from "@/components/bottom-nav";
import { Dashboard } from "@/components/pages/dashboard";
import { Kakeibo } from "@/components/pages/kakeibo";
import { Savings } from "@/components/pages/savings";
import { Chat } from "@/components/pages/chat";
import { RecordMenuDialog } from "@/components/record-menu-dialog";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";
import { useSwipe } from "@/lib/use-swipe";
const SettingsModal = dynamic(
  () => import("@/components/settings-modal").then((module) => module.SettingsModal),
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
const TransferSummaryDialog = dynamic(
  () => import("@/components/transfer-summary-dialog").then((module) => module.TransferSummaryDialog),
  { loading: () => null }
);

const NAV_ORDER: NavPage[] = ["dashboard", "kakeibo", "savings", "chat"];
const SETTINGS_TABS = new Set([
  "fixed",
  "transfers",
  "budget",
  "categories",
  "accounts",
  "home",
  "gmail",
  "push",
  "other",
]);

function AppContent() {
  const {
    user,
    isAuthLoading,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedUser,
    theme,
    setKakeiboTab,
    setSettingsTab,
  } = useApp();
  const { assets: charAssets, isActive: charActive } = useCharacter();
  const [currentPage, setCurrentPage] = useState<NavPage>("dashboard");
  const [isRecordMenuOpen, setIsRecordMenuOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [isAddSavingOpen, setIsAddSavingOpen] = useState(false);
  const [isTransferSummaryOpen, setIsTransferSummaryOpen] = useState(false);
  const [loginKey, setLoginKey] = useState(0);
  const [splashFadeOut, setSplashFadeOut] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [loadedPages, setLoadedPages] = useState<NavPage[]>(["dashboard"]);

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

  // AIチャットからの画面遷移。page="settings" は設定モーダルを開く。
  const handleChatNavigate = (page: string, subTab?: string) => {
    if (page === "settings") {
      if (subTab && SETTINGS_TABS.has(subTab)) {
        setSettingsTab(subTab);
      }
      setIsSettingsOpen(true);
      return;
    }
    if (page === "kakeibo") {
      if (subTab === "analysis" || subTab === "history") {
        setKakeiboTab(subTab);
      }
      setCurrentPage("kakeibo");
      return;
    }
    if (page === "dashboard" || page === "savings" || page === "chat") {
      setCurrentPage(page);
    }
  };

  // スワイプで 4 画面を左右に切り替える
  const goToAdjacentPage = (dir: 1 | -1) => {
    const idx = NAV_ORDER.indexOf(currentPage);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= NAV_ORDER.length) return;
    setCurrentPage(NAV_ORDER[next]);
  };
  const swipeHandlers = useSwipe({
    onSwipeLeft: () => goToAdjacentPage(1),
    onSwipeRight: () => goToAdjacentPage(-1),
  });

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

  useEffect(() => {
    setLoadedPages((prev) => (prev.includes(currentPage) ? prev : [...prev, currentPage]));
  }, [currentPage]);

  // 補助ダイアログと家計簿サブ画面はアイドル時間に先読みしておく。
  useEffect(() => {
    if (typeof window === "undefined") return;

    const preloadOptionalChunks = () => {
      import("@/components/pages/analysis").catch(() => {});
      import("@/components/pages/history").catch(() => {});
      import("@/components/settings-modal").catch(() => {});
      import("@/components/add-expense-dialog").catch(() => {});
      import("@/components/add-income-dialog").catch(() => {});
      import("@/components/add-saving-dialog").catch(() => {});
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(preloadOptionalChunks, { timeout: 1500 });
    } else {
      setTimeout(preloadOptionalChunks, 300);
    }
  }, []);

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
      <main
        className="container mx-auto px-3 pt-0 pb-6 max-w-lg"
        {...swipeHandlers}
      >
        <section className={currentPage === "dashboard" ? "block" : "hidden"} aria-hidden={currentPage !== "dashboard"}>
          {loadedPages.includes("dashboard") && (
            <Dashboard
              onNavigateToAnalysis={handleNavigateToAnalysis}
              onNavigateToHistory={handleNavigateToHistory}
              onNavigateToTransfers={() => setIsTransferSummaryOpen(true)}
            />
          )}
        </section>
        <section className={currentPage === "kakeibo" ? "block" : "hidden"} aria-hidden={currentPage !== "kakeibo"}>
          {loadedPages.includes("kakeibo") && <Kakeibo />}
        </section>
        <section className={currentPage === "savings" ? "block" : "hidden"} aria-hidden={currentPage !== "savings"}>
          {loadedPages.includes("savings") && <Savings />}
        </section>
        <section className={currentPage === "chat" ? "block" : "hidden"} aria-hidden={currentPage !== "chat"}>
          {loadedPages.includes("chat") && <Chat onNavigate={handleChatNavigate} />}
        </section>
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

      {isTransferSummaryOpen && (
        <TransferSummaryDialog
          open={isTransferSummaryOpen}
          onOpenChange={setIsTransferSummaryOpen}
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
