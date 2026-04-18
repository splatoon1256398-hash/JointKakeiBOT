"use client";

import { createPortal } from "react-dom";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

interface SuccessOverlayProps {
  /** Whether the overlay is shown */
  open: boolean;
  /** Main celebration text */
  title?: string;
  /** Secondary celebration text */
  subtitle?: string;
}

const CONFETTI_COLORS = [
  "#FFD700",
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
] as const;

const CONFETTI_COUNT = 18;

/**
 * Fullscreen celebration overlay shown after a successful save when a
 * character is active. Rendered via a Portal so the absolute-positioned
 * confetti pieces aren't clipped by Radix dialog transforms.
 */
export function SuccessOverlay({
  open,
  title = "記録できた！",
  subtitle = "ナイス家計管理！",
}: SuccessOverlayProps) {
  const { assets: charAssets, isActive: charActive } = useCharacter();

  if (!open || !charActive || !charAssets || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center">
      <div className="text-center space-y-4 animate-char-celebrate">
        <CharacterImage
          src={charAssets.success || charAssets.avatar}
          alt="成功！"
          width={140}
          height={140}
          className="mx-auto drop-shadow-2xl"
          fallback={null}
        />
        <p className="text-2xl font-bold text-white">{title}</p>
        <p className="text-base text-white/60">{subtitle}</p>
      </div>
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
        <div
          key={i}
          className="absolute w-3 h-3 rounded-full animate-confetti"
          style={{
            left: `${5 + Math.random() * 90}%`,
            top: "-10px",
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${Math.random() * 0.8}s`,
            animationDuration: `${1.5 + Math.random() * 1}s`,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
