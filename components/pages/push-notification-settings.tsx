"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { subscribeToPush, unsubscribeFromPush, registerServiceWorker } from "@/lib/push";

type PushState = "loading" | "unsupported" | "denied" | "prompt" | "subscribed" | "unsubscribed";

export function PushNotificationSettings() {
  const { user, theme } = useApp();
  const [pushState, setPushState] = useState<PushState>("loading");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    checkPushState();
  }, []);

  const checkPushState = async () => {
    // ブラウザ対応チェック
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setPushState("denied");
      return;
    }

    // 既存購読チェック（タイムアウト付き）
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
      const registration = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        timeout,
      ]);

      if (!registration) {
        setPushState(permission === "granted" ? "unsubscribed" : "prompt");
        return;
      }

      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        setPushState("subscribed");
      } else {
        setPushState(permission === "granted" ? "unsubscribed" : "prompt");
      }
    } catch {
      setPushState("prompt");
    }
  };

  const handleSubscribe = async () => {
    if (!user) return;
    setIsProcessing(true);
    try {
      await registerServiceWorker();
      const result = await subscribeToPush(user.id);
      if (result) {
        setPushState("subscribed");
      } else {
        // 許可が拒否された可能性
        if (Notification.permission === "denied") {
          setPushState("denied");
        }
      }
    } catch (error) {
      console.error("Subscribe error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsProcessing(true);
    try {
      await unsubscribeFromPush();
      setPushState("unsubscribed");
    } catch (error) {
      console.error("Unsubscribe error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Bell className="h-5 w-5" style={{ color: theme.primary }} />
          Push通知
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          「共同」の支出が登録されたとき、パートナーに通知を送信します
        </p>
      </div>

      {/* 状態表示 */}
      <div className="rounded-xl p-4" style={{ background: `${theme.primary}10`, border: `1px solid ${theme.primary}40` }}>
        {pushState === "loading" && (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="text-sm text-gray-400">確認中...</span>
          </div>
        )}

        {pushState === "unsupported" && (
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">非対応ブラウザ</p>
              <p className="text-xs text-gray-400 mt-1">
                お使いのブラウザはPush通知に対応していません。Chrome, Edge, Firefox をお試しください。
                iOSの場合は「ホーム画面に追加」してからご利用ください。
              </p>
            </div>
          </div>
        )}

        {pushState === "denied" && (
          <div className="flex items-start gap-3">
            <BellOff className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">通知がブロックされています</p>
              <p className="text-xs text-gray-400 mt-1">
                ブラウザの設定から通知の許可を変更してください。
              </p>
            </div>
          </div>
        )}

        {pushState === "subscribed" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-400">通知ON</p>
                <p className="text-xs text-gray-400">共同支出の通知を受信中です</p>
              </div>
            </div>
            <button
              onClick={handleUnsubscribe}
              disabled={isProcessing}
              className="w-full p-2.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                "通知をOFFにする"
              )}
            </button>
          </div>
        )}

        {(pushState === "prompt" || pushState === "unsubscribed") && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-white/60 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">通知OFF</p>
                <p className="text-xs text-gray-400">
                  ONにすると、パートナーが「共同」支出を登録したときに通知が届きます
                </p>
              </div>
            </div>
            <button
              onClick={handleSubscribe}
              disabled={isProcessing}
              className="w-full p-2.5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                "通知をONにする"
              )}
            </button>
          </div>
        )}
      </div>

      {/* 説明 */}
      <div className="rounded-xl p-4 bg-amber-900/20 border border-amber-600/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-200">
            <p className="font-semibold mb-1">通知について</p>
            <ul className="space-y-1 text-amber-300/80">
              <li>・「共同」支出のみ通知されます（個人支出は通知されません）</li>
              <li>・通知内容: 金額とメモ（または店名）</li>
              <li>・登録者本人には通知されません</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
