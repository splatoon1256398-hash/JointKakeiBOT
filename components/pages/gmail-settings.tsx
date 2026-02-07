"use client";

import { useState, useEffect } from "react";
import { Mail, Eye, EyeOff, Copy, Check, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface UserSettings {
  user_id: string;
  gmail_integration_enabled: boolean;
  api_secret_key: string;
  linked_user_type?: string;
}

export function GmailSettings() {
  const { user, theme } = useApp();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // 設定の取得
  const fetchSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      
      // 設定がなければ作成
      if (!data) {
        const { data: newData, error: insertError } = await supabase
          .from("user_settings")
          .insert({ user_id: user.id })
          .select()
          .single();
        
        if (insertError) throw insertError;
        setSettings(newData);
      } else {
        setSettings(data);
      }
    } catch (error) {
      console.error("設定取得エラー:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [user]);

  // Gmail連携の切り替え
  const toggleGmailIntegration = async () => {
    if (!user || !settings) return;
    setSaving(true);
    try {
      const newValue = !settings.gmail_integration_enabled;
      const { error } = await supabase
        .from("user_settings")
        .update({ gmail_integration_enabled: newValue })
        .eq("user_id", user.id);

      if (error) throw error;
      setSettings({ ...settings, gmail_integration_enabled: newValue });
    } catch (error) {
      console.error("設定更新エラー:", error);
    } finally {
      setSaving(false);
    }
  };

  // シークレットキーの再生成
  const regenerateKey = async () => {
    if (!user || !confirm("シークレットキーを再生成しますか？\n既存のGAS連携が無効になります。")) return;
    setSaving(true);
    try {
      // UUIDを生成
      const newKey = crypto.randomUUID();
      const { error } = await supabase
        .from("user_settings")
        .update({ api_secret_key: newKey })
        .eq("user_id", user.id);

      if (error) throw error;
      setSettings({ ...settings!, api_secret_key: newKey });
    } catch (error) {
      console.error("キー再生成エラー:", error);
    } finally {
      setSaving(false);
    }
  };

  // クリップボードにコピー
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("コピーエラー:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const apiEndpoint = typeof window !== "undefined" 
    ? `${window.location.origin}/api/gmail-webhook`
    : "/api/gmail-webhook";

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Mail className="h-5 w-5" style={{ color: theme.primary }} />
          Gmail連携（自動処理）
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          GASでGmailの明細を自動取得し、家計簿に反映します
        </p>
      </div>

      {/* ON/OFFスイッチ */}
      <div 
        className="rounded-xl p-4"
        style={{ background: `${theme.primary}10`, border: `1px solid ${theme.primary}40` }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Gmail連携を有効にする</p>
            <p className="text-xs text-gray-400 mt-0.5">
              有効にすると、GASからのデータ受信が可能になります
            </p>
          </div>
          <button
            onClick={toggleGmailIntegration}
            disabled={saving}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings?.gmail_integration_enabled ? '' : 'bg-slate-600'
            }`}
            style={settings?.gmail_integration_enabled ? { background: theme.primary } : {}}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                settings?.gmail_integration_enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ユーザー紐付け */}
      {settings?.gmail_integration_enabled && (
        <div className="rounded-xl p-4 bg-black/15 border border-white/5">
          <p className="text-sm font-semibold text-white mb-2">Gmail連携ユーザー</p>
          <p className="text-xs text-white/40 mb-3">
            このGmail連携で自動登録される支出の登録者を選択してください
          </p>
          <div className="grid grid-cols-2 gap-2">
            {["れん", "あかね"].map((ut) => (
              <button
                key={ut}
                onClick={async () => {
                  if (!user) return;
                  setSaving(true);
                  try {
                    await supabase
                      .from("user_settings")
                      .update({ linked_user_type: ut })
                      .eq("user_id", user.id);
                    setSettings({ ...settings!, linked_user_type: ut });
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className={`p-3 rounded-lg text-sm font-semibold transition-all ${
                  settings?.linked_user_type === ut
                    ? 'text-white ring-2'
                    : 'text-white/50 bg-white/5 hover:bg-white/10'
                }`}
                style={
                  settings?.linked_user_type === ut
                    ? { backgroundColor: theme.primary, boxShadow: `0 0 0 2px ${theme.secondary}` }
                    : {}
                }
              >
                {ut}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* API情報（有効時のみ表示） */}
      {settings?.gmail_integration_enabled && (
        <div className="space-y-3">
          {/* APIエンドポイント */}
          <div className="rounded-xl p-4 bg-slate-800/50 border border-slate-700">
            <Label className="text-xs text-gray-400">APIエンドポイント</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 text-xs text-green-400 bg-slate-900 p-2 rounded overflow-x-auto">
                {apiEndpoint}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(apiEndpoint)}
                className="h-8 w-8 p-0 text-gray-400 hover:text-white"
              >
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* シークレットキー */}
          <div className="rounded-xl p-4 bg-slate-800/50 border border-slate-700">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-gray-400">シークレットキー</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={regenerateKey}
                disabled={saving}
                className="h-6 px-2 text-xs text-gray-400 hover:text-white"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                再生成
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-yellow-400 bg-slate-900 p-2 rounded overflow-x-auto">
                {showKey ? settings?.api_secret_key : "••••••••••••••••••••••••••••••••"}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKey(!showKey)}
                className="h-8 w-8 p-0 text-gray-400 hover:text-white"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(settings?.api_secret_key || "")}
                className="h-8 w-8 p-0 text-gray-400 hover:text-white"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* GAS設定方法 */}
          <div className="rounded-xl p-4 bg-amber-900/20 border border-amber-600/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-200">
                <p className="font-semibold mb-1">GAS側の設定</p>
                <p className="text-amber-300/80">
                  GASスクリプトで、上記のエンドポイントに以下のJSONをPOSTしてください：
                </p>
                <pre className="mt-2 p-2 bg-slate-900 rounded text-green-400 overflow-x-auto">
{`{
  "date": "2026-02-03",
  "amount": 1500,
  "store": "Amazon",
  "category_main": "日用品費",
  "category_sub": "雑貨",
  "user_type": "共同",
  "secret_key": "あなたのシークレットキー"
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
