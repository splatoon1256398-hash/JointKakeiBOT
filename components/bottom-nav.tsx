"use client";

import { Home, BookOpen, PlusCircle, PiggyBank, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/app-context";

export type NavPage = "dashboard" | "kakeibo" | "savings" | "chat";

interface BottomNavProps {
  currentPage: NavPage;
  onPageChange: (page: NavPage) => void;
  onRecordClick: () => void;
}

export function BottomNav({ currentPage, onPageChange, onRecordClick }: BottomNavProps) {
  const { theme } = useApp();
  
  const navItems = [
    { id: "dashboard" as NavPage, icon: Home, label: "ホーム" },
    { id: "kakeibo" as NavPage, icon: BookOpen, label: "家計簿" },
    { id: "record", icon: PlusCircle, label: "記録", isCenter: true },
    { id: "savings" as NavPage, icon: PiggyBank, label: "貯金" },
    { id: "chat" as NavPage, icon: MessageCircle, label: "チャット" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
      <div className="relative mx-auto max-w-lg">
        {/* 背景（テーマカラーのアクセントライン） */}
        <div 
          className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl shadow-2xl"
          style={{ borderTop: `2px solid ${theme.primary}` }}
        ></div>
        
        {/* ナビゲーションアイテム */}
        <div className="relative flex items-center justify-around h-20 px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            
            if (item.isCenter) {
              return (
                <button
                  key={item.id}
                  onClick={onRecordClick}
                  className="relative group -mt-8"
                >
                  {/* グロー効果 */}
                  <div 
                    className="absolute inset-0 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity animate-pulse"
                    style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}
                  ></div>
                  
                  {/* メインボタン */}
                  <div 
                    className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transform transition-all duration-300 group-hover:scale-110 group-active:scale-95"
                    style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
                  >
                    <Icon className="w-8 h-8 text-white" />
                    
                    {/* キラキラエフェクト */}
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 group-hover:animate-shimmer"></div>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id as NavPage)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 min-w-[4rem] py-2 transition-all duration-300",
                  isActive ? "scale-110" : "scale-100 opacity-60 hover:opacity-100"
                )}
              >
                <div 
                  className="relative p-2 rounded-xl transition-all duration-300"
                  style={isActive ? { background: `${theme.primary}20` } : {}}
                >
                  <Icon 
                    className="w-6 h-6 transition-colors"
                    style={{ color: isActive ? theme.primary : '#9ca3af' }}
                  />
                  
                  {/* アクティブインジケーター */}
                  {isActive && (
                    <div 
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full animate-pulse"
                      style={{ background: theme.primary }}
                    ></div>
                  )}
                </div>
                
                <span 
                  className="text-xs font-medium transition-colors"
                  style={{ color: isActive ? theme.primary : '#9ca3af' }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
