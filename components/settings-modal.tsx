"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Tag, Wallet, CreditCard, Mail, Bell, LayoutGrid, X } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { Settings } from "@/components/pages/settings";
import { BudgetSettings } from "@/components/pages/budget-settings";
import { FixedExpenses } from "@/components/pages/fixed-expenses";
import { GmailSettings } from "@/components/pages/gmail-settings";
import { PushNotificationSettings } from "@/components/pages/push-notification-settings";
import { HomeWidgetSettings } from "@/components/pages/home-widget-settings";

export function SettingsModal() {
  const { isSettingsOpen, setIsSettingsOpen, theme } = useApp();

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border-slate-700">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-white">
              <SettingsIcon className="h-5 w-5" style={{ color: theme.primary }} />
              設定
            </DialogTitle>
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

          <TabsContent value="fixed" className="mt-4">
            <FixedExpenses />
          </TabsContent>

          <TabsContent value="budget" className="mt-4">
            <BudgetSettings />
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <Settings />
          </TabsContent>

          <TabsContent value="home" className="mt-4">
            <HomeWidgetSettings />
          </TabsContent>

          <TabsContent value="gmail" className="mt-4">
            <GmailSettings />
          </TabsContent>

          <TabsContent value="push" className="mt-4">
            <PushNotificationSettings />
          </TabsContent>

          <TabsContent value="other" className="mt-4">
            <div className="p-8 text-center text-gray-400">
              <SettingsIcon className="h-16 w-16 mx-auto mb-4 text-gray-600" />
              <p>その他の設定は準備中です</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
