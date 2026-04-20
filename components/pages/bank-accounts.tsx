"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Loader2, Landmark, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import type { BankAccount, OwnerUserType } from "@/lib/transfers";
import { isOwnerUserType } from "@/lib/transfers";

export function BankAccounts() {
  const { user, theme, selectedUser, bankAccounts, refreshBankAccounts } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 現在のスコープに該当する口座だけ表示（共同モード→共同、個人モード→その人）
  const scopeOwner: OwnerUserType = isOwnerUserType(selectedUser) ? selectedUser : "共同";
  const filteredAccounts = bankAccounts.filter((a) => a.owner_user_type === scopeOwner);

  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [accountLast4, setAccountLast4] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [icon, setIcon] = useState("🏦");
  const [isMain, setIsMain] = useState<boolean>(false);

  const addFormRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setAccountName("");
    setBankName("");
    setBranchName("");
    setAccountLast4("");
    setColor("#4f46e5");
    setIcon("🏦");
    setIsMain(false);
    setEditingId(null);
    setShowAddForm(false);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    await refreshBankAccounts();
    setLoading(false);
  }, [refreshBankAccounts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleEdit = (acc: BankAccount) => {
    setEditingId(acc.id);
    setAccountName(acc.account_name);
    setBankName(acc.bank_name ?? "");
    setBranchName(acc.branch_name ?? "");
    setAccountLast4(acc.account_last4 ?? "");
    setColor(acc.color ?? "#4f46e5");
    setIcon(acc.icon ?? "🏦");
    setIsMain(acc.is_main === true);
    setShowAddForm(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddForm(true);
    setTimeout(() => {
      addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  const handleSave = async () => {
    if (!user || !accountName) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        owner_user_type: scopeOwner,
        account_name: accountName,
        bank_name: bankName || null,
        branch_name: branchName || null,
        account_last4: accountLast4 || null,
        color,
        icon: icon || "🏦",
        is_active: true,
        is_main: isMain,
      };

      if (editingId) {
        const { error } = await supabase
          .from("bank_accounts")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const maxSort = bankAccounts.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0);
        const { error } = await supabase.from("bank_accounts").insert({
          ...payload,
          sort_order: maxSort + 10,
        });
        if (error) throw error;
      }

      resetForm();
      await refresh();
    } catch (e) {
      console.error("銀行口座保存エラー:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この口座を削除しますか？紐付いた固定費の引落先は未設定になります。")) return;
    try {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      await refresh();
    } catch (e) {
      console.error("銀行口座削除エラー:", e);
    }
  };

  const renderInlineForm = (isAdd: boolean) => (
    <div
      className="rounded-xl p-3 bg-slate-800/50 border space-y-3"
      style={{ borderColor: `${theme.primary}40` }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-white">
          {isAdd ? "口座を追加" : "口座を編集"}
        </p>
        <button onClick={resetForm} className="text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <Label className="text-xs text-gray-400">所有者</Label>
          <div
            className="h-9 rounded-md border flex items-center px-3 text-sm font-semibold text-white"
            style={{ background: `${theme.primary}20`, borderColor: `${theme.primary}40` }}
          >
            {scopeOwner}
            <span className="text-[10px] text-white/40 ml-2">
              （ヘッダーのタブで切替）
            </span>
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-400">アイコン</Label>
          <Input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🏦"
            maxLength={4}
            className="bg-slate-700 border-slate-600 text-white h-9 w-16 text-center"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs text-gray-400">口座名（表示用）</Label>
        <Input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="例: メイン口座 / 給与振込用"
          className="bg-slate-700 border-slate-600 text-white h-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">銀行名（任意）</Label>
          <Input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="例: みずほ銀行"
            className="bg-slate-700 border-slate-600 text-white h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-400">支店名（任意）</Label>
          <Input
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="例: ○○支店"
            className="bg-slate-700 border-slate-600 text-white h-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">口座番号下4桁（任意）</Label>
          <Input
            value={accountLast4}
            onChange={(e) => setAccountLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1234"
            inputMode="numeric"
            maxLength={4}
            className="bg-slate-700 border-slate-600 text-white h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-400">カラー</Label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full h-9 rounded-md bg-slate-700 border border-slate-600 cursor-pointer"
          />
        </div>
      </div>

      {/* メイン口座トグル */}
      <button
        type="button"
        onClick={() => setIsMain((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
          isMain
            ? "border-emerald-500/50 bg-emerald-500/10"
            : "border-white/10 bg-white/5"
        }`}
      >
        <div className="text-left">
          <p className="text-sm font-semibold text-white">
            メイン口座
            {isMain && <span className="ml-1 text-emerald-400">✓</span>}
          </p>
          <p className="text-[10px] text-white/50 leading-tight">
            給料振込口座などで残高がある口座。自分→自分の事前振込を振込画面から除外します
          </p>
        </div>
        <div
          className={`w-10 h-5 rounded-full flex items-center transition-all flex-shrink-0 ${
            isMain ? "bg-emerald-500 justify-end" : "bg-white/20 justify-start"
          }`}
        >
          <div className="w-4 h-4 bg-white rounded-full mx-0.5" />
        </div>
      </button>

      <div className="flex gap-2 pt-1">
        <Button
          variant="ghost"
          onClick={resetForm}
          className="flex-1 text-gray-400 hover:text-white"
        >
          キャンセル
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !accountName}
          className="flex-1 text-white"
          style={{ background: theme.primary }}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : editingId ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              更新
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              追加
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5" style={{ color: theme.primary }} />
          <h2 className="text-base font-semibold text-white">
            {scopeOwner} の口座
          </h2>
          <span className="text-xs text-white/40">({filteredAccounts.length})</span>
        </div>
        {!showAddForm && !editingId && (
          <Button
            onClick={handleOpenAdd}
            size="sm"
            className="text-white h-8"
            style={{ background: theme.primary }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            追加
          </Button>
        )}
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed">
        固定費の引落先として使う口座を登録します。共同口座はヘッダーで「共同」を選んだ状態で登録してください。
      </p>

      {showAddForm && (
        <div ref={addFormRef}>{renderInlineForm(true)}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : filteredAccounts.length === 0 && !showAddForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {scopeOwner} の口座はまだ登録されていません
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAccounts.map((acc) =>
            editingId === acc.id ? (
              <div key={acc.id}>{renderInlineForm(false)}</div>
            ) : (
              <div
                key={acc.id}
                className="rounded-xl p-3 bg-slate-800/40 border border-slate-700/50 flex items-center gap-3"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                  style={{ background: `${acc.color ?? theme.primary}30` }}
                >
                  {acc.icon ?? "🏦"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">
                      {acc.account_name}
                    </p>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{
                        background: `${acc.color ?? theme.primary}25`,
                        color: acc.color ?? theme.primary,
                      }}
                    >
                      {acc.owner_user_type}
                    </span>
                    {acc.is_main && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-300">
                        メイン
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50 truncate">
                    {[acc.bank_name, acc.branch_name, acc.account_last4 && `****${acc.account_last4}`]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(acc)}
                    className="p-1.5 text-white/50 hover:text-white"
                    aria-label="編集"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id)}
                    className="p-1.5 text-white/50 hover:text-red-400"
                    aria-label="削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
