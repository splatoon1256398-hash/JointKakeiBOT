"use client";

import { useState, useCallback } from "react";
import { Palette, Check, RotateCcw, Info, Users, User, Sparkles, Wallet } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { CHARACTER_LIST, CharacterId } from "@/lib/characters";
import Image from "next/image";

const PRESET_COLORS = [
  { label: "パープル", hex: "#8b5cf6" },
  { label: "ブルー", hex: "#022fe3" },
  { label: "セージ", hex: "#7c9475" },
  { label: "ローズ", hex: "#e11d48" },
  { label: "オレンジ", hex: "#ea580c" },
  { label: "ティール", hex: "#0d9488" },
  { label: "インディゴ", hex: "#4f46e5" },
  { label: "ピンク", hex: "#ec4899" },
  { label: "アンバー", hex: "#d97706" },
  { label: "エメラルド", hex: "#059669" },
  { label: "スカイ", hex: "#0284c7" },
  { label: "レッド", hex: "#dc2626" },
  { label: "フューシャ", hex: "#c026d3" },
  { label: "ライム", hex: "#65a30d" },
  { label: "シアン", hex: "#0891b2" },
  { label: "スレート", hex: "#475569" },
];

export function ThemeSettings() {
  const {
    theme, selectedUser, displayName,
    customThemeColor, setCustomThemeColor, saveCustomThemeColor,
    jointThemeColor, setJointThemeColor, saveJointThemeColor,
    characterId, saveCharacterId,
  } = useApp();

  const isJoint = selectedUser === "共同";

  // 現在のモードに応じたカラーを取得
  const currentColor = isJoint ? jointThemeColor : customThemeColor;
  const [customHex, setCustomHex] = useState(currentColor || theme.primary);
  const [isSaving, setIsSaving] = useState(false);

  // モード切替時にcustomHexを同期
  const syncedColor = isJoint ? (jointThemeColor || "#4f46e5") : (customThemeColor || theme.primary);
  // useStateの初期値との不整合を検出してリセット
  // (selectedUserが変わったらcustomHexを更新)
  const [lastMode, setLastMode] = useState(isJoint);
  if (lastMode !== isJoint) {
    setLastMode(isJoint);
    setCustomHex(syncedColor);
  }

  const handlePresetClick = useCallback((hex: string) => {
    setCustomHex(hex);
    if (isJoint) {
      setJointThemeColor(hex);
    } else {
      setCustomThemeColor(hex);
    }
  }, [isJoint, setCustomThemeColor, setJointThemeColor]);

  const handleCustomColorChange = useCallback((hex: string) => {
    setCustomHex(hex);
    if (isJoint) {
      setJointThemeColor(hex);
    } else {
      setCustomThemeColor(hex);
    }
  }, [isJoint, setCustomThemeColor, setJointThemeColor]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isJoint) {
        await saveJointThemeColor(customHex);
      } else {
        await saveCustomThemeColor(customHex);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      if (isJoint) {
        await saveJointThemeColor(null);
        setCustomHex("#4f46e5");
      } else {
        await saveCustomThemeColor(null);
        setCustomHex(theme.primary);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const [charSaving, setCharSaving] = useState(false);

  const handleCharacterSelect = useCallback(async (id: CharacterId) => {
    setCharSaving(true);
    try {
      await saveCharacterId(id);
    } finally {
      setCharSaving(false);
    }
  }, [saveCharacterId]);

  return (
    <div className="space-y-4">
      {/* 着せ替え設定 */}
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: theme.primary }} />
          着せ替え
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          キャラクターを選ぶとアプリ全体のアイコンが変わります
        </p>
      </div>

      <div className="rounded-xl p-4 bg-black/15 border border-white/5">
        <div className="grid grid-cols-2 gap-3">
          {/* ノーマル */}
          <button
            onClick={() => handleCharacterSelect("none")}
            disabled={charSaving}
            className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              characterId === "none"
                ? "border-white/40 bg-white/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            {characterId === "none" && (
              <div className="absolute top-2 right-2">
                <Check className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-white/60" />
            </div>
            <span className="text-xs font-semibold text-white/80">ノーマ���</span>
          </button>

          {/* キャラクター一覧 */}
          {CHARACTER_LIST.map((char) => (
            <button
              key={char.id}
              onClick={() => handleCharacterSelect(char.id)}
              disabled={charSaving}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                characterId === char.id
                  ? "border-white/40 bg-white/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              {characterId === char.id && (
                <div className="absolute top-2 right-2">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
              <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                <Image
                  src={char.previewImage}
                  alt={char.name}
                  width={48}
                  height={48}
                  className="object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = "none";
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-white/80">{char.name}</span>
              <span className="text-[9px] text-white/40 text-center leading-tight">{char.description}</span>
            </button>
          ))}
        </div>
      </div>

      <hr className="border-white/10" />

      {/* テーマカラー設定 */}
      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Palette className="h-5 w-5" style={{ color: theme.primary }} />
          テーマカラー
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          アプリ全体の背景色とアクセントカラーを変更できます
        </p>
      </div>

      {/* モード表示 */}
      <div className={`rounded-lg p-3 border ${isJoint ? "bg-purple-500/10 border-purple-500/20" : "bg-blue-500/10 border-blue-500/20"}`}>
        <div className="flex items-start gap-2">
          {isJoint ? (
            <Users className="h-3.5 w-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
          ) : (
            <User className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          )}
          <p className={`text-[10px] leading-relaxed ${isJoint ? "text-purple-300/80" : "text-blue-300/80"}`}>
            {isJoint
              ? "共同モードのイメージカラーを設定します。共同の財布を見ている時にこの色が適用されます。"
              : `${displayName || "あなた"} 個人のテーマカラーを設定します。個人モード表示時にこの色が適用されます。`
            }
          </p>
        </div>
      </div>

      {/* 現在のプレビュー */}
      <div className="rounded-xl overflow-hidden">
        <div
          className="p-4 flex items-center justify-between"
          style={{ backgroundColor: theme.primary }}
        >
          <div>
            <p className="text-white font-bold text-sm">プレビュー</p>
            <p className="text-white/70 text-xs">
              {isJoint ? "共同" : (displayName || "あなた")} のテーマ
            </p>
          </div>
          <div
            className="w-12 h-12 rounded-xl border-2 border-white/30 flex items-center justify-center"
            style={{ backgroundColor: theme.primary }}
          >
            <div
              className="w-6 h-6 rounded-lg"
              style={{ backgroundColor: theme.secondary }}
            />
          </div>
        </div>
        <div className="p-3 bg-black/15 border border-white/5 border-t-0 rounded-b-xl">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40">Primary:</span>
            <code className="text-[10px] text-white/70 font-mono">{theme.primary}</code>
            <span className="text-[10px] text-white/40 ml-2">Secondary:</span>
            <code className="text-[10px] text-white/70 font-mono">{theme.secondary}</code>
          </div>
        </div>
      </div>

      {/* プリセットカラー */}
      <div className="rounded-xl p-4 bg-black/15 border border-white/5">
        <p className="text-xs font-semibold text-white mb-3">プリセット</p>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset.hex}
              onClick={() => handlePresetClick(preset.hex)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-white/5 transition-all"
            >
              <div
                className="w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center"
                style={{
                  backgroundColor: preset.hex,
                  borderColor: customHex === preset.hex ? "#fff" : "transparent",
                  transform: customHex === preset.hex ? "scale(1.15)" : "scale(1)",
                }}
              >
                {customHex === preset.hex && (
                  <Check className="h-3.5 w-3.5 text-white drop-shadow-md" />
                )}
              </div>
              <span className="text-[9px] text-white/50 leading-tight">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* カスタムカラーピッカー */}
      <div className="rounded-xl p-4 bg-black/15 border border-white/5">
        <p className="text-xs font-semibold text-white mb-3">カスタムカラー</p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="color"
              value={customHex}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              className="w-12 h-12 rounded-xl border-2 border-white/20 cursor-pointer bg-transparent"
              style={{ padding: 0 }}
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={customHex}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                  setCustomHex(v);
                  if (v.length === 7) {
                    if (isJoint) {
                      setJointThemeColor(v);
                    } else {
                      setCustomThemeColor(v);
                    }
                  }
                }
              }}
              placeholder="#000000"
              className="w-full h-10 rounded-lg bg-black/20 border border-white/10 text-white text-sm font-mono px-3"
            />
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex gap-2">
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="flex-1 p-3 rounded-xl text-white/60 text-sm font-semibold bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          リセット
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 p-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
        >
          {isSaving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}
