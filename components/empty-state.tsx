"use client";

import Image from "next/image";
import { useCharacter } from "@/lib/use-character";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  const { assets, isActive } = useCharacter();

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      {isActive && assets && (
        <Image src={assets.empty} alt="" width={80} height={80} className="opacity-60" />
      )}
      <p className="text-white/40 text-sm">{message}</p>
    </div>
  );
}
