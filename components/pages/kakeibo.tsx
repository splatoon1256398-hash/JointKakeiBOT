"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { History } from "./history";
import { Analysis } from "./analysis";

export function Kakeibo() {
  const { selectedUser, theme } = useApp();
  const [mode, setMode] = useState<'history' | 'analysis'>('analysis');

  return (
    <div className="space-y-3 pb-24 pt-3">
      {/* ヘッダー（テーマカラーのボーダー） */}
      <div 
        className="relative overflow-hidden rounded-xl p-3 shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: `2px solid ${theme.primary}`
        }}
      >
        <div className="text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" style={{ color: theme.primary }} />
              <h1 className="text-base font-bold">家計簿 - {selectedUser}</h1>
            </div>
            {/* ピル型タブ（分析が左＝優先位置） */}
            <div className="flex bg-white/95 rounded-full p-0.5 shadow-inner">
              <button
                onClick={() => setMode('analysis')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all duration-200 ${
                  mode === 'analysis' 
                    ? 'text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
                style={mode === 'analysis' ? { 
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` 
                } : {}}
              >
                分析
              </button>
              <button
                onClick={() => setMode('history')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all duration-200 ${
                  mode === 'history' 
                    ? 'text-white shadow-md' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
                style={mode === 'history' ? { 
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
      {mode === 'history' ? <History isCompact /> : <Analysis />}
    </div>
  );
}
