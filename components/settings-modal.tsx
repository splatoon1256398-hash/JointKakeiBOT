"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Tag, Wallet, CreditCard, Mail, Bell, LayoutGrid, X, User, Users } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { Settings } from "@/components/pages/settings";
import { BudgetSettings } from "@/components/pages/budget-settings";
import { FixedExpenses } from "@/components/pages/fixed-expenses";
import { GmailSettings } from "@/components/pages/gmail-settings";
import { PushNotificationSettings } from "@/components/pages/push-notification-settings";
import { HomeWidgetSettings } from "@/components/pages/home-widget-settings";
import { ThemeSettings } from "@/components/pages/theme-settings";

// 各タブのスコープ定義
const TAB_SCOPE: Record<string, "personal" | "shared" | "both"> = {
  fixed: "shared",
  budget: "shared",
  categories: "shared",
  home: "personal",
  gmail: "personal",
  push: "personal",
  other: "personal",
};

function ScopeBadge({ scope }: { scope: "personal" | "shared" | "both" }) {
  if (scope === "shared") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/20">
        <Users className="h-2.5 w-2.5" />
        共同
      </span>
    );
  }
  if (scope === "personal") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/20">
        <User className="h-2.5 w-2.5" />
        個人
      </span>
    );
  }
  return null;
}

export function SettingsModal() {
  const { isSettingsOpen, setIsSettingsOpen, theme, selectedUser, displayName } = useApp();

  const isJoint = selectedUser === "共同";
  const contextLabel = isJoint
    ? "共同設定を編集"
    : `${displayName || selectedUser} の設定を編集`;

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border-slate-700">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-white">
                <SettingsIcon className="h-5 w-5" style={{ color: theme.primary }} />
                設定
              </DialogTitle>
              {/* コンテキストヘッダー */}
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: `${theme.primary}20`,
                    color: theme.primary,
                  }}
                >
                  {isJoint ? (
                    <Users className="h-3 w-3" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                  {contextLabel}
                </div>
              </div>
            </div>
            <Button
              onClick={() => setIsSettingsOpen(false)}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="fixed" className="w-full">
          <TabsList className="grid w-full grid-cols-7 bg-slate-800/50 h-auto p-1">
            <TabsTrigger value="fixed" className="flex flex-col gap-1 py-2 text-[10px]">
              <CreditCard className="h-4 w-4" />
              固定費
            </TabsTrigger>
            <TabsTrigger value="budget" className="flex flex-col gap-1 py-2 text-[10px]">
              <Wallet className="h-4 w-4" />
              予算
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex flex-col gap-1 py-2 text-[10px]">
              <Tag className="h-4 w-4" />
              カテゴリ
            </TabsTrigger>
            <TabsTrigger value="home" className="flex flex-col gap-1 py-2 text-[10px]">
              <LayoutGrid className="h-4 w-4" />
              ホーム
            </TabsTrigger>
            <TabsTrigger value="gmail" className="flex flex-col gap-1 py-2 text-[10px]">
              <Mail className="h-4 w-4" />
              Gmail
            </TabsTrigger>
            <TabsTrigger value="push" className="flex flex-col gap-1 py-2 text-[10px]">
              <Bell className="h-4 w-4" />
              通知
            </TabsTrigger>
            <TabsTrigger value="other" className="flex flex-col gap-1 py-2 text-[10px]">
              <SettingsIcon className="h-4 w-4" />
              その他
            </TabsTrigger>
          </TabsList>

          {/* 各タブコンテンツ + スコープバッジ */}
          <TabsContent value="fixed" className="mt-4">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.fixed} />
            </div>
            <FixedExpenses />
          </TabsContent>

          <TabsContent value="budget" className="mt-4">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.budget} />
            </div>
            <BudgetSettings />
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.categories} />
            </div>
            <Settings />
          </TabsContent>

          <TabsContent value="home" className="mt-4">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.home} />
            </div>
            <HomeWidgetSettings />
          </TabsContent>

          <TabsContent value="gmail" className="mt-4">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.gmail} />
            </div>
            <GmailSettings />
          </TabsContent>

          <TabsContent value="push" className="mt-4">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.push} />
            </div>
            <PushNotificationSettings />
          </TabsContent>

          <TabsContent value="other" className="mt-4">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.other} />
            </div>
            <ThemeSettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
