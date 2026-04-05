"use client";

import { useState, useEffect } from "react";
import { Wallet } from "lucide-react";
import Image from "next/image";
import { CharacterId, isValidCharacterId, getCharacterAssets } from "@/lib/characters";

interface SplashScreenProps {
  fadeOut?: boolean;
}

export function SplashScreen({ fadeOut = false }: SplashScreenProps) {
  const [charId, setCharId] = useState<CharacterId>("none");

  useEffect(() => {
    const cached = localStorage.getItem("characterId");
    if (isValidCharacterId(cached)) setCharId(cached);
  }, []);

  const charAssets = getCharacterAssets(charId);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-500 ${
        fadeOut ? "animate-splash-out pointer-events-none" : ""
      }`}
      style={{
        background: "linear-gradient(135deg, #8b5cf6, #6d28d9, #4c1d95)",
      }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* ロゴ */}
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-white/20 blur-2xl animate-pulse-glow" />
          <div className="relative w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center shadow-2xl overflow-hidden">
            {charAssets ? (
              <Image src={charAssets.splash} alt="Character" width={96} height={96} className="object-contain" />
            ) : (
              <Wallet className="w-12 h-12 text-white" />
            )}
          </div>
        </div>

        {/* テキスト */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-wide">
            共同家計簿
          </h1>
          <p className="text-white/60 text-sm mt-2">Loading...</p>
        </div>

        {/* ローディングバー */}
        <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/80 rounded-full animate-gradient"
            style={{
              width: "60%",
              backgroundSize: "200% 100%",
              backgroundImage:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)",
              animation: "shimmer 1.5s infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}
