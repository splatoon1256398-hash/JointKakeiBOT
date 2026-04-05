"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, Tag, Wallet, CreditCard, Mail, Bell, LayoutGrid, User, Users } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { Settings } from "@/components/pages/settings";
import { BudgetSettings } from "@/components/pages/budget-settings";
import { FixedExpenses } from "@/components/pages/fixed-expenses";
import { GmailSettings } from "@/components/pages/gmail-settings";
import { PushNotificationSettings } from "@/components/pages/push-notification-settings";
import { HomeWidgetSettings } from "@/components/pages/home-widget-settings";
import { ThemeSettings } from "@/components/pages/theme-settings";

// 各タブのスコープ定義
// "personal" = ログインユーザー個人の設定（共同モードでも個人として保存される）
// "shared"   = selectedUser（共同 or 個人）に紐づく共有設定
const TAB_SCOPE: Record<string, "personal" | "shared"> = {
  fixed: "shared",
  budget: "shared",
  categories: "shared",
  home: "personal",
  gmail: "personal",
  push: "personal",
  other: "personal",
};

const TAB_SCOPE_LABEL: Record<string, string> = {
  fixed: "選択中のユーザーの固定費",
  budget: "選択中のユーザーの予算",
  categories: "全員で共有するカテゴリ",
  home: "あなた個人のホーム設定",
  gmail: "あなた個人のGmail連携",
  push: "あなた個人の通知設定",
  other: "あなた個人のテーマ・着せ替え設定",
};

function ScopeBadge({ scope, label }: { scope: "personal" | "shared"; label?: string }) {
  if (scope === "shared") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/20">
          <Users className="h-2.5 w-2.5" />
          共同
        </span>
        {label && <span className="text-[9px] text-white/30">{label}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/20">
        <User className="h-2.5 w-2.5" />
        個人
      </span>
      {label && <span className="text-[9px] text-white/30">{label}</span>}
    </div>
  );
}

export function SettingsModal() {
  const { isSettingsOpen, setIsSettingsOpen, theme, selectedUser, displayName, settingsTab, setSettingsTab } = useApp();

  const isJoint = selectedUser === "共同";

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-slate-900/95 backdrop-blur-xl border-slate-700" style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-white">
                <SettingsIcon className="h-5 w-5" style={{ color: theme.primary }} />
                設定
              </DialogTitle>
              {/* コンテキストヘッダー: 現在の操作対象 */}
              <div className="flex items-center gap-2">
                {isJoint ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300">
                    <Users className="h-3 w-3" />
                    共同設定を編集中
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                  >
                    <User className="h-3 w-3" />
                    {displayName || selectedUser} の設定を編集中
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="w-full min-w-0">
          <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
            <TabsList className="inline-flex w-max min-w-full bg-slate-800/50 h-auto p-1 gap-0.5">
              <TabsTrigger value="fixed" className="flex flex-col gap-1 py-2 px-2 text-[10px] min-w-0 flex-shrink-0">
                <CreditCard className="h-4 w-4" />
                固定費
              </TabsTrigger>
              <TabsTrigger value="budget" className="flex flex-col gap-1 py-2 px-2 text-[10px] min-w-0 flex-shrink-0">
                <Wallet className="h-4 w-4" />
                予算
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex flex-col gap-1 py-2 px-2 text-[10px] min-w-0 flex-shrink-0">
                <Tag className="h-4 w-4" />
                カテゴリ
              </TabsTrigger>
              <TabsTrigger value="home" className="flex flex-col gap-1 py-2 px-2 text-[10px] min-w-0 flex-shrink-0">
                <LayoutGrid className="h-4 w-4" />
                ホーム
              </TabsTrigger>
              <TabsTrigger value="gmail" className="flex flex-col gap-1 py-2 px-2 text-[10px] min-w-0 flex-shrink-0">
                <Mail className="h-4 w-4" />
                Gmail
              </TabsTrigger>
              <TabsTrigger value="push" className="flex flex-col gap-1 py-2 px-2 text-[10px] min-w-0 flex-shrink-0">
                <Bell className="h-4 w-4" />
                通知
              </TabsTrigger>
              <TabsTrigger value="other" className="flex flex-col gap-1 py-2 px-2 text-[10px] min-w-0 flex-shrink-0">
                <SettingsIcon className="h-4 w-4" />
                その他
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 各タブコンテンツ - min-h で高さ固定 */}
          <TabsContent value="fixed" className="mt-4 min-h-[520px]">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.fixed} label={TAB_SCOPE_LABEL.fixed} />
            </div>
            <FixedExpenses />
          </TabsContent>

          <TabsContent value="budget" className="mt-4 min-h-[520px]">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.budget} label={TAB_SCOPE_LABEL.budget} />
            </div>
            <BudgetSettings />
          </TabsContent>

          <TabsContent value="categories" className="mt-4 min-h-[520px]">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.categories} label={TAB_SCOPE_LABEL.categories} />
            </div>
            <Settings />
          </TabsContent>

          <TabsContent value="home" className="mt-4 min-h-[520px]">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.home} label={TAB_SCOPE_LABEL.home} />
            </div>
            <HomeWidgetSettings />
          </TabsContent>

          <TabsContent value="gmail" className="mt-4 min-h-[520px]">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.gmail} label={TAB_SCOPE_LABEL.gmail} />
            </div>
            <GmailSettings />
          </TabsContent>

          <TabsContent value="push" className="mt-4 min-h-[520px]">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.push} label={TAB_SCOPE_LABEL.push} />
            </div>
            <PushNotificationSettings />
          </TabsContent>

          <TabsContent value="other" className="mt-4 min-h-[520px]">
            <div className="flex justify-end mb-2">
              <ScopeBadge scope={TAB_SCOPE.other} label={TAB_SCOPE_LABEL.other} />
            </div>
            <ThemeSettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
