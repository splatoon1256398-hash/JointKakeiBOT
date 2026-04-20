"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Loader2, Landmark, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/app-context";
import type { BankAccount, OwnerUserType } from "@/lib/transfers";

const OWNER_OPTIONS: OwnerUserType[] = ["れん", "あかね", "共同"];

export function BankAccounts() {
  const { user, theme, bankAccounts, refreshBankAccounts } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [accountName, setAccountName] = useState("");
  const [ownerUserType, setOwnerUserType] = useState<OwnerUserType>("れん");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [accountLast4, setAccountLast4] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [icon, setIcon] = useState("🏦");

  const addFormRef = useRef<HTMLDivElement>(null);

  const resetForm = () => {
    setAccountName("");
    setOwnerUserType("れん");
    setBankName("");
    setBranchName("");
    setAccountLast4("");
    setColor("#4f46e5");
    setIcon("🏦");
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
    setOwnerUserType((acc.owner_user_type as OwnerUserType) ?? "れん");
    setBankName(acc.bank_name ?? "");
    setBranchName(acc.branch_name ?? "");
    setAccountLast4(acc.account_last4 ?? "");
    setColor(acc.color ?? "#4f46e5");
    setIcon(acc.icon ?? "🏦");
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
    if (!user || !accountName || !ownerUserType) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        owner_user_type: ownerUserType,
        account_name: accountName,
        bank_name: bankName || null,
        branch_name: branchName || null,
        account_last4: accountLast4 || null,
        color,
        icon: icon || "🏦",
        is_active: true,
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">所有者</Label>
          <Select value={ownerUserType} onValueChange={(v) => setOwnerUserType(v as OwnerUserType)}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {OWNER_OPTIONS.map((o) => (
                <SelectItem key={o} value={o} className="text-white">
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-400">アイコン</Label>
          <Input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🏦"
            maxLength={4}
            className="bg-slate-700 border-slate-600 text-white h-9 text-center"
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
          disabled={saving || !accountName || !ownerUserType}
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
          <h2 className="text-base font-semibold text-white">銀行口座</h2>
          <span className="text-xs text-white/40">({bankAccounts.length})</span>
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
        固定費の引落先として使う口座を登録します。共同口座も所有者「共同」で登録できます。
      </p>

      {showAddForm && (
        <div ref={addFormRef}>{renderInlineForm(true)}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : bankAccounts.length === 0 && !showAddForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          まだ口座が登録されていません
        </div>
      ) : (
        <div className="space-y-2">
          {bankAccounts.map((acc) =>
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
