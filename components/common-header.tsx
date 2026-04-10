"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

export function CommonHeader() {
  const { selectedUser, setSelectedUser, setIsSettingsOpen, displayName, theme } = useApp();
  const { assets: charAssets, isActive: charActive, speeches } = useCharacter();
  const [showSpeech, setShowSpeech] = useState(false);
  const [speechText, setSpeechText] = useState("");

  const isJointSelected = selectedUser === "共同";
  const isPersonalSelected = selectedUser === displayName || selectedUser === "自分";

  const handleAvatarTap = useCallback(() => {
    if (!charActive || speeches.length === 0) return;
    const randomSpeech = speeches[Math.floor(Math.random() * speeches.length)];
    setSpeechText(randomSpeech);
    setShowSpeech(true);
  }, [charActive, speeches]);

  useEffect(() => {
    if (showSpeech) {
      const timer = setTimeout(() => setShowSpeech(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showSpeech]);

  return (
    <header
      className="sticky top-0 z-40 w-full shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`
      }}
    >
      <div className="container mx-auto px-4 py-3 max-w-lg">
        <div className="flex items-center justify-between gap-3">
          {/* キャラアバター */}
          {charActive && charAssets && (
            <div className="relative">
              <button
                onClick={handleAvatarTap}
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/30 hover:scale-110 active:scale-95 transition-transform overflow-hidden"
              >
                <CharacterImage
                  src={charAssets.avatar}
                  alt="キャラクター"
                  width={36}
                  height={36}
                  className="object-cover"
                  loading="eager"
                  sizes="36px"
                  fallback={null}
                />
              </button>

              {/* セリフ吹き出し */}
              {showSpeech && (
                <div className="absolute left-12 top-1/2 -translate-y-1/2 z-50 animate-speech-pop">
                  <div className="relative bg-white rounded-xl px-3 py-1.5 shadow-lg whitespace-nowrap">
                    <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rotate-45" />
                    <span className="relative text-xs font-bold text-gray-800">{speechText}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ピル型ユーザー切り替えタブ: 個人 → 共同 の順 */}
          <div className="flex-1 flex bg-white/95 rounded-full p-1 shadow-inner">
            <button
              onClick={() => setSelectedUser(displayName || "自分")}
              className={`flex-1 py-1.5 px-4 text-xs font-bold rounded-full transition-all duration-200 ${
                isPersonalSelected
                  ? 'text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
              style={isPersonalSelected ? {
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`
              } : {}}
            >
              {displayName || "自分"}
            </button>
            <button
              onClick={() => setSelectedUser("共同")}
              className={`flex-1 py-1.5 px-4 text-xs font-bold rounded-full transition-all duration-200 ${
                isJointSelected
                  ? 'text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
              style={isJointSelected ? {
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`
              } : {}}
            >
              共同
            </button>
          </div>

          {/* 設定アイコン */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2.5 rounded-full bg-white/95 shadow-md hover:bg-white transition-colors"
          >
            <Settings className="w-4 h-4" style={{ color: theme.primary }} />
          </button>
        </div>
      </div>
    </header>
  );
}
