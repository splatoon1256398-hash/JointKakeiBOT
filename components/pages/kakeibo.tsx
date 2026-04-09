"use client";

import dynamic from "next/dynamic";
import { BookOpen } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

const History = dynamic(
  () => import("./history").then((module) => module.History),
  {
    loading: () => (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-white/60">
        履歴を読み込み中...
      </div>
    ),
  }
);

const Analysis = dynamic(
  () => import("./analysis").then((module) => module.Analysis),
  {
    loading: () => (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-white/60">
        分析を読み込み中...
      </div>
    ),
  }
);

export function Kakeibo() {
  const { selectedUser, theme, kakeiboTab, setKakeiboTab } = useApp();
  const { assets: charAssets, isActive: charActive, themeColors: charColors } = useCharacter();

  return (
    <div className="space-y-3 pb-24 pt-3">
      {/* ヘッダー（テーマカラーのボーダー） */}
      <div
        className="relative overflow-hidden rounded-xl p-3 shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: `2px solid ${theme.primary}`,
          ...(charActive && charColors ? { boxShadow: `inset 0 0 20px ${charColors.cardAccent}` } : {}),
        }}
      >
        <div className="text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {charActive && charAssets ? (
                <CharacterImage src={charAssets.avatar} alt="" width={20} height={20} className="object-contain" fallback={<BookOpen className="h-4 w-4" style={{ color: theme.primary }} />} />
              ) : (
                <BookOpen className="h-4 w-4" style={{ color: theme.primary }} />
              )}
              <h1 className="text-base font-bold">家計簿 - {selectedUser}</h1>
            </div>
            {/* ピル型タブ（分析が左＝優先位置） */}
            <div className="flex bg-white/95 rounded-full p-0.5 shadow-inner">
              <button
                onClick={() => setKakeiboTab('analysis')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all duration-200 ${
                  kakeiboTab === 'analysis' 
                    ? 'text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
                style={kakeiboTab === 'analysis' ? { 
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` 
                } : {}}
              >
                分析
              </button>
              <button
                onClick={() => setKakeiboTab('history')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all duration-200 ${
                  kakeiboTab === 'history' 
                    ? 'text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
                style={kakeiboTab === 'history' ? { 
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` 
                } : {}}
              >
                履歴
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      {kakeiboTab === 'history' ? <History isCompact /> : <Analysis />}
    </div>
  );
}
