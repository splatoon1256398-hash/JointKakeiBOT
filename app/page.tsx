"use client";

import { useState } from "react";
import { AppProvider, useApp } from "@/contexts/app-context";
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

function AppContent() {
  const { user, selectedUser } = useApp();
  const [currentPage, setCurrentPage] = useState<NavPage>("dashboard");
  const [isRecordMenuOpen, setIsRecordMenuOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [isAddSavingOpen, setIsAddSavingOpen] = useState(false);
  const [loginKey, setLoginKey] = useState(0);

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

  // ページ遷移ハンドラー
  const handleNavigateToAnalysis = () => {
    setCurrentPage("kakeibo");
  };

  // ログインしていない場合はログイン画面を表示
  if (!user) {
    return <Login key={loginKey} onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* 共通ヘッダー */}
      <CommonHeader />

      {/* メインコンテンツ */}
      <main className="container mx-auto px-3 pt-0 pb-6 max-w-lg">
        {currentPage === "dashboard" && <Dashboard onNavigateToAnalysis={handleNavigateToAnalysis} />}
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
