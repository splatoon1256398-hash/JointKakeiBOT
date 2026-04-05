"use client";

import { useState, useEffect } from "react";
import { AppProvider, useApp } from "@/contexts/app-context";
import { SplashScreen } from "@/components/splash-screen";
import { Login } from "@/components/auth/login";
import { CommonHeader } from "@/components/common-header";
import { SettingsModal } from "@/components/settings-modal";
import { BottomNav, type NavPage } from "@/components/bottom-nav";
import { Dashboard } from "@/components/pages/dashboard";
import { Kakeibo } from "@/components/pages/kakeibo";
import { Savings } from "@/components/pages/savings";
import { Chat } from "@/components/pages/chat";
import { RecordMenuDialog } from "@/components/record-menu-dialog";
import { AddExpenseDialog } from "@/components/add-expense-dialog";
import { AddIncomeDialog } from "@/components/add-income-dialog";
import { AddSavingDialog } from "@/components/add-saving-dialog";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

function AppContent() {
  const { user, isAuthLoading, selectedUser, theme, setKakeiboTab } = useApp();
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
  useEffect(() => {
    if (!isAuthLoading) {
      // auth check 完了 -> フェードアウト開始
      setSplashFadeOut(true);
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 600); // アニメーション完了後に非表示
      return () => clearTimeout(timer);
    }
  }, [isAuthLoading]);

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

  // スプラッシュ表示中
  if (showSplash) {
    return <SplashScreen fadeOut={splashFadeOut} />;
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
      {/* 背景パターン（キャラ着せ替え時） */}
      {charActive && charAssets && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.06]">
          <div
            className="absolute animate-pattern-drift"
            style={{
              inset: '-60px',
              backgroundImage: `url(${charAssets.watermark})`,
              backgroundSize: '120px 120px',
              backgroundRepeat: 'repeat',
            }}
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

      {/* 設定モーダル */}
      <SettingsModal />

      {/* 記録メニューダイアログ */}
      <RecordMenuDialog
        open={isRecordMenuOpen}
        onOpenChange={setIsRecordMenuOpen}
        onSelectExpense={handleSelectExpense}
        onSelectIncome={handleSelectIncome}
        onSelectSaving={handleSelectSaving}
      />

      {/* 支出追加ダイアログ */}
      <AddExpenseDialog
        open={isAddExpenseOpen}
        onOpenChange={setIsAddExpenseOpen}
        selectedUser={selectedUser}
      />

      {/* 収入追加ダイアログ */}
      <AddIncomeDialog
        open={isAddIncomeOpen}
        onOpenChange={setIsAddIncomeOpen}
        selectedUser={selectedUser}
      />

      {/* 貯金追加ダイアログ */}
      <AddSavingDialog
        open={isAddSavingOpen}
        onOpenChange={setIsAddSavingOpen}
      />
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
