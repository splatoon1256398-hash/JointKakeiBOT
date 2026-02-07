"use client";

import { useState, useEffect } from "react";
import { Mail, Eye, EyeOff, Copy, Check, RefreshCw, Loader2, AlertCircle, Shield, Wifi, Plus, Trash2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";

interface UserSettings {
  user_id: string;
  gmail_integration_enabled: boolean;
  api_secret_key: string;
  linked_user_type?: string;
  google_refresh_token?: string | null;
  gmail_watch_expiration?: string | null;
}

interface GmailFilter {
  id: string;
  filter_type: string;
  target_type: string;
  keyword: string;
}

export function GmailSettings() {
  const { user, theme } = useApp();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Gmail Pub/Sub 関連
  const [isWatching, setIsWatching] = useState(false);
  const [filters, setFilters] = useState<GmailFilter[]>([]);
  const [newFilter, setNewFilter] = useState({ filterType: "WHITELIST", targetType: "SUBJECT", keyword: "" });
  const [addingFilter, setAddingFilter] = useState(false);

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

  const fetchFilters = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/gmail/filters?user_id=${user.id}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setFilters(data);
      }
    } catch (error) {
      console.error("フィルタ取得エラー:", error);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchFilters();
  }, [user]);

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

  const regenerateKey = async () => {
    if (!user || !confirm("シークレットキーを再生成しますか？\n既存のGAS連携が無効になります。")) return;
    setSaving(true);
    try {
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("コピーエラー:", error);
    }
  };

  // Google OAuth 開始
  const startGoogleOAuth = () => {
    if (!user) return;
    window.location.href = `/api/auth/google?user_id=${user.id}`;
  };

  // Gmail Watch 開始
  const startWatch = async () => {
    if (!user) return;
    setIsWatching(true);
    try {
      const res = await fetch("/api/gmail/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Gmail監視を開始しました！");
        await fetchSettings();
      } else {
        alert(`エラー: ${data.error || "不明なエラー"}`);
      }
    } catch (error) {
      console.error("Watch開始エラー:", error);
      alert("Gmail監視の開始に失敗しました");
    } finally {
      setIsWatching(false);
    }
  };

  // フィルタ追加
  const addFilter = async () => {
    if (!user || !newFilter.keyword.trim()) return;
    setAddingFilter(true);
    try {
      const res = await fetch("/api/gmail/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          filterType: newFilter.filterType,
          targetType: newFilter.targetType,
          keyword: newFilter.keyword.trim(),
        }),
      });
      if (res.ok) {
        setNewFilter({ filterType: "WHITELIST", targetType: "SUBJECT", keyword: "" });
        await fetchFilters();
      }
    } catch (error) {
      console.error("フィルタ追加エラー:", error);
    } finally {
      setAddingFilter(false);
    }
  };

  // フィルタ削除
  const deleteFilter = async (filterId: string) => {
    try {
      await fetch(`/api/gmail/filters?id=${filterId}`, { method: "DELETE" });
      await fetchFilters();
    } catch (error) {
      console.error("フィルタ削除エラー:", error);
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

  const isGoogleLinked = !!settings?.google_refresh_token;
  const watchExpiration = settings?.gmail_watch_expiration ? new Date(settings.gmail_watch_expiration) : null;
  const isWatchActive = watchExpiration ? watchExpiration > new Date() : false;

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Mail className="h-5 w-5" style={{ color: theme.primary }} />
          Gmail連携
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          GASまたはPub/SubでGmailの明細を自動取得し、家計簿に反映します
        </p>
      </div>

      {/* === セクション1: GAS連携（従来） === */}
      <div className="rounded-xl p-4 bg-black/15 border border-white/5">
        <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: theme.secondary }} />
          GAS連携（従来方式）
        </h4>

        {/* ON/OFFスイッチ */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-white">Gmail連携を有効にする</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
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

        {settings?.gmail_integration_enabled && (
          <div className="space-y-2">
            {/* ユーザー紐付け */}
            <div className="rounded-lg p-3 bg-black/15 border border-white/5">
              <p className="text-xs font-semibold text-white mb-2">連携ユーザー</p>
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
                    className={`p-2 rounded-lg text-xs font-semibold transition-all ${
                      settings?.linked_user_type === ut
                        ? 'text-white'
                        : 'text-white/50 bg-white/5 hover:bg-white/10'
                    }`}
                    style={
                      settings?.linked_user_type === ut
                        ? { backgroundColor: theme.primary }
                        : {}
                    }
                  >
                    {ut}
                  </button>
                ))}
              </div>
            </div>

            {/* APIエンドポイント */}
            <div className="rounded-lg p-3 bg-black/20 border border-white/5">
              <Label className="text-[10px] text-gray-400">APIエンドポイント</Label>
              <div className="flex items-center gap-1 mt-1">
                <code className="flex-1 text-[10px] text-green-400 bg-slate-900/80 p-1.5 rounded overflow-x-auto">
                  {apiEndpoint}
                </code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(apiEndpoint)} className="h-7 w-7 p-0 text-gray-400 hover:text-white">
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            {/* シークレットキー */}
            <div className="rounded-lg p-3 bg-black/20 border border-white/5">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[10px] text-gray-400">シークレットキー</Label>
                <button onClick={regenerateKey} disabled={saving} className="text-[10px] text-gray-400 hover:text-white flex items-center gap-0.5">
                  <RefreshCw className="h-3 w-3" />再生成
                </button>
              </div>
              <div className="flex items-center gap-1">
                <code className="flex-1 text-[10px] text-yellow-400 bg-slate-900/80 p-1.5 rounded overflow-x-auto">
                  {showKey ? settings?.api_secret_key : "••••••••••••••••••"}
                </code>
                <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)} className="h-7 w-7 p-0 text-gray-400 hover:text-white">
                  {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(settings?.api_secret_key || "")} className="h-7 w-7 p-0 text-gray-400 hover:text-white">
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === セクション2: Google Pub/Sub（新方式） === */}
      <div className="rounded-xl p-4 bg-black/15 border border-white/5">
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Wifi className="h-4 w-4" style={{ color: theme.secondary }} />
          Gmail Pub/Sub（リアルタイム自動連携）
        </h4>

        {/* Step 1: Google OAuth */}
        <div className="space-y-3">
          <div className="rounded-lg p-3 bg-black/20 border border-white/5">
            <p className="text-xs font-semibold text-white mb-1">1. Googleアカウント連携</p>
            <p className="text-[10px] text-gray-400 mb-2">
              Gmailの閲覧権限を許可してください
            </p>
            {isGoogleLinked ? (
              <div className="flex items-center gap-2 text-green-400 text-xs">
                <Check className="h-4 w-4" />
                <span className="font-semibold">連携済み</span>
              </div>
            ) : (
              <button
                onClick={startGoogleOAuth}
                className="w-full p-2.5 rounded-lg text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: theme.primary }}
              >
                <Shield className="h-4 w-4" />
                Googleアカウントを連携
              </button>
            )}
          </div>

          {/* Step 2: Watch */}
          <div className="rounded-lg p-3 bg-black/20 border border-white/5">
            <p className="text-xs font-semibold text-white mb-1">2. Gmail監視</p>
            <p className="text-[10px] text-gray-400 mb-2">
              Gmailの受信トレイを監視し、決済メールを自動解析します
            </p>
            {isWatchActive ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-green-400 text-xs">
                  <Check className="h-4 w-4" />
                  <span className="font-semibold">監視中</span>
                </div>
                <p className="text-[10px] text-gray-400">
                  有効期限: {watchExpiration?.toLocaleDateString("ja-JP")} {watchExpiration?.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <button
                  onClick={startWatch}
                  disabled={isWatching || !isGoogleLinked}
                  className="text-[10px] text-white/50 hover:text-white/70 flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />手動更新
                </button>
              </div>
            ) : (
              <button
                onClick={startWatch}
                disabled={isWatching || !isGoogleLinked}
                className="w-full p-2.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: isGoogleLinked ? theme.primary : undefined }}
              >
                {isWatching ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />開始中...</>
                ) : (
                  <><Wifi className="h-4 w-4" />Gmail監視を開始</>
                )}
              </button>
            )}
          </div>

          {/* Step 3: フィルタ */}
          <div className="rounded-lg p-3 bg-black/20 border border-white/5">
            <p className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              3. メールフィルタ
            </p>
            <p className="text-[10px] text-gray-400 mb-3">
              処理するメールをホワイトリスト/ブラックリストで制御
            </p>

            {/* フィルタ追加フォーム */}
            <div className="space-y-2 mb-3">
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={newFilter.filterType}
                  onChange={(e) => setNewFilter({ ...newFilter, filterType: e.target.value })}
                  className="h-8 rounded-lg bg-black/30 border border-white/10 text-white text-[10px] px-2 appearance-none"
                >
                  <option value="WHITELIST">ホワイトリスト</option>
                  <option value="BLACKLIST">ブラックリスト</option>
                </select>
                <select
                  value={newFilter.targetType}
                  onChange={(e) => setNewFilter({ ...newFilter, targetType: e.target.value })}
                  className="h-8 rounded-lg bg-black/30 border border-white/10 text-white text-[10px] px-2 appearance-none"
                >
                  <option value="SUBJECT">件名</option>
                  <option value="SENDER">送信者</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newFilter.keyword}
                  onChange={(e) => setNewFilter({ ...newFilter, keyword: e.target.value })}
                  placeholder="キーワード（例: カード利用）"
                  className="flex-1 h-8 rounded-lg bg-black/30 border border-white/10 text-white text-xs px-2 placeholder:text-white/20"
                />
                <button
                  onClick={addFilter}
                  disabled={addingFilter || !newFilter.keyword.trim()}
                  className="h-8 px-3 rounded-lg text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1"
                  style={{ backgroundColor: theme.primary }}
                >
                  {addingFilter ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </button>
              </div>
            </div>

            {/* フィルタ一覧 */}
            {filters.length > 0 ? (
              <div className="space-y-1.5">
                {filters.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-black/15 border border-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        f.filter_type === "WHITELIST" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {f.filter_type === "WHITELIST" ? "許可" : "拒否"}
                      </span>
                      <span className="text-[10px] text-white/40">
                        {f.target_type === "SUBJECT" ? "件名" : "送信者"}:
                      </span>
                      <span className="text-xs text-white truncate">{f.keyword}</span>
                    </div>
                    <button
                      onClick={() => deleteFilter(f.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-white/30 text-center py-2">
                フィルタ未設定（すべてのメールが処理対象）
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 注意事項 */}
      <div className="rounded-xl p-4 bg-amber-900/20 border border-amber-600/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-200">
            <p className="font-semibold mb-1">注意事項</p>
            <ul className="space-y-1 text-amber-300/80 text-[10px]">
              <li>・Pub/Sub連携にはGoogle Cloud Projectの設定が必要です</li>
              <li>・Gmail監視は7日ごとに自動更新されます</li>
              <li>・ホワイトリストを設定すると、一致するメールのみ処理されます</li>
              <li>・ブラックリストは常に優先されます</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
