"use client";

import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

type Tone = "purple" | "green";

interface ScanningOverlayProps {
  /** Whether the overlay is visible */
  open: boolean;
  /** Main message shown while scanning */
  title: string;
  /** Secondary / subtitle message */
  subtitle: string;
  /** Color tone (purple for expense, green for income) */
  tone?: Tone;
}

const TONE_CLASSES: Record<Tone, { border: string; icon: string }> = {
  purple: {
    border: "border-t-purple-400",
    icon: "text-purple-300",
  },
  green: {
    border: "border-t-green-400",
    icon: "text-green-300",
  },
};

/**
 * Fullscreen overlay shown while a receipt / income statement is being
 * uploaded + analyzed by Gemini. Rendered via a React Portal so the
 * `fixed` positioning is anchored to `document.body` rather than the
 * Radix Dialog `translate` transform.
 */
export function ScanningOverlay({
  open,
  title,
  subtitle,
  tone = "purple",
}: ScanningOverlayProps) {
  const { assets: charAssets, isActive: charActive } = useCharacter();

  if (!open || typeof document === "undefined") return null;

  const classes = TONE_CLASSES[tone];

  return createPortal(
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center">
      <div className="text-center space-y-6 px-8">
        {charActive && charAssets ? (
          <>
            <div className="relative mx-auto w-40 h-40">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div
                className={`absolute inset-0 rounded-full border-4 border-transparent ${classes.border} animate-spin`}
                style={{ animationDuration: "1.2s" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <CharacterImage
                  src={charAssets.scanning}
                  alt="解析中"
                  width={100}
                  height={100}
                  className="animate-bounce"
                  fallback={<Sparkles className={`h-10 w-10 ${classes.icon}`} />}
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-bold text-white">{title}</p>
              <p className="text-sm text-white/50">{subtitle}</p>
            </div>
          </>
        ) : (
          <>
            <div className="relative mx-auto w-24 h-24">
              <div
                className={`absolute inset-0 rounded-full border-2 ${
                  tone === "purple" ? "border-purple-500/20" : "border-green-500/20"
                }`}
              />
              <div
                className={`absolute inset-0 rounded-full border-2 border-transparent ${classes.border} animate-spin`}
                style={{ animationDuration: "1s" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className={`h-8 w-8 ${classes.icon}`} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-white">{title}</p>
              <p className="text-sm text-white/40">{subtitle}</p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
