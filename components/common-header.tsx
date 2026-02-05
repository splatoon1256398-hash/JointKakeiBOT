"use client";

import { Settings } from "lucide-react";
import { useApp } from "@/contexts/app-context";

export function CommonHeader() {
  const { selectedUser, setSelectedUser, setIsSettingsOpen, displayName, theme } = useApp();

  const isJointSelected = selectedUser === "共同";
  const isPersonalSelected = selectedUser === displayName || selectedUser === "自分";

  return (
    <header 
      className="sticky top-0 z-40 w-full shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`
      }}
    >
      <div className="container mx-auto px-4 py-3 max-w-lg">
        <div className="flex items-center justify-between gap-3">
          {/* ピル型ユーザー切り替えタブ */}
          <div className="flex-1 flex bg-white/95 rounded-full p-1 shadow-inner">
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
