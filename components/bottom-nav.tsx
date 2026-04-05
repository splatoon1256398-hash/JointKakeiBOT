"use client";

import { Home, BookOpen, PlusCircle, PiggyBank, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/app-context";
import { useCharacter } from "@/lib/use-character";
import { CharacterAssets } from "@/lib/characters";
import { CharacterImage } from "@/components/character-image";

export type NavPage = "dashboard" | "kakeibo" | "savings" | "chat";

interface BottomNavProps {
  currentPage: NavPage;
  onPageChange: (page: NavPage) => void;
  onRecordClick: () => void;
}

export function BottomNav({ currentPage, onPageChange, onRecordClick }: BottomNavProps) {
  const { theme } = useApp();
  const { assets, isActive: charIsActive, themeColors } = useCharacter();

  const navItems: { id: NavPage | "record"; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; isCenter?: boolean; assetKey?: keyof CharacterAssets }[] = [
    { id: "dashboard" as NavPage, icon: Home, label: "ホーム", assetKey: "navHome" },
    { id: "kakeibo" as NavPage, icon: BookOpen, label: "家計簿", assetKey: "navKakeibo" },
    { id: "record", icon: PlusCircle, label: "記録", isCenter: true, assetKey: "navRecord" },
    { id: "savings" as NavPage, icon: PiggyBank, label: "貯金", assetKey: "navSavings" },
    { id: "chat" as NavPage, icon: MessageCircle, label: "チャット", assetKey: "navChat" },
  ];

  // キャラ専用ナビバーカラー
  const navBgColor = charIsActive && themeColors
    ? themeColors.navBg
    : "rgba(0,0,0,0.35)";
  const navBorderColor = charIsActive && themeColors
    ? `1px solid ${themeColors.navGlow}`
    : "1px solid rgba(255,255,255,0.1)";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ backgroundColor: theme.background }}
    >
      <div className="relative mx-auto max-w-lg">
        {/* 背景 */}
        <div
          className="absolute inset-0 backdrop-blur-xl shadow-2xl"
          style={{
            backgroundColor: navBgColor,
            borderTop: navBorderColor,
          }}
        />

        {/* キャラ着せ替え時のグロー装飾 */}
        {charIsActive && themeColors && (
          <div
            className="absolute inset-x-0 -top-px h-[2px] opacity-60"
            style={{
              background: `linear-gradient(90deg, transparent, ${themeColors.navGlow}, ${themeColors.cardAccent}, ${themeColors.navGlow}, transparent)`,
            }}
          />
        )}

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
                  />

                  {/* メインボタン */}
                  <div
                    className="relative w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center shadow-2xl transform transition-all duration-300 group-hover:scale-110 group-active:scale-95 overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
                  >
                    {assets && item.assetKey && assets[item.assetKey] ? (
                      <CharacterImage
                        src={assets[item.assetKey]!}
                        alt={item.label}
                        width={44}
                        height={44}
                        className="object-contain"
                        fallback={<Icon className="w-9 h-9 text-white" />}
                      />
                    ) : (
                      <Icon className="w-9 h-9 text-white" />
                    )}

                    {/* キラキラエフェクト */}
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 group-hover:animate-shimmer" />
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
                  style={isActive ? {
                    background: charIsActive && themeColors
                      ? themeColors.cardAccent
                      : "rgba(255,255,255,0.15)"
                  } : {}}
                >
                  {assets && item.assetKey && assets[item.assetKey] ? (
                    <CharacterImage
                      src={assets[item.assetKey]!}
                      alt={item.label}
                      width={32}
                      height={32}
                      className="w-8 h-8 object-contain transition-opacity"
                      fallback={
                        <Icon
                          className="w-7 h-7 transition-colors"
                          style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)' }}
                        />
                      }
                    />
                  ) : (
                    <Icon
                      className="w-7 h-7 transition-colors"
                      style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)' }}
                    />
                  )}

                  {/* アクティブインジケーター */}
                  {isActive && (
                    <div
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full animate-pulse bg-white"
                    />
                  )}
                </div>

                <span
                  className="text-xs font-medium transition-colors"
                  style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)' }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* iOS セーフエリアの余白（テーマカラーで塗りつぶし） */}
        <div
          style={{
            paddingBottom: 'env(safe-area-inset-bottom)',
            backgroundColor: navBgColor,
          }}
        />
      </div>
    </nav>
  );
}
