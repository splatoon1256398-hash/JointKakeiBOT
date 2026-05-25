"use client";

import { useCharacter } from "@/lib/use-character";
import { CharacterImage } from "@/components/character-image";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  const { assets, isActive } = useCharacter();
  const helperText = message.includes("目標")
    ? "ちいさく始めても、ちゃんと進むよ"
    : message.includes("履歴")
      ? "最初の記録、待ってるね"
      : "また記録しにいこ〜";

  return (
    <div className="flex flex-col items-center gap-2.5 py-8">
      {isActive && assets && (
        <CharacterImage
          src={assets.empty}
          alt=""
          width={92}
          height={92}
          className="opacity-75 drop-shadow-[0_10px_18px_rgba(0,0,0,0.24)]"
          fallback={null}
          unoptimized
        />
      )}
      <p className="text-white/40 text-sm">{message}</p>
      {isActive && (
        <p className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-white/45">
          {helperText}
        </p>
      )}
    </div>
  );
}
