"use client";

import { useApp } from "@/contexts/app-context";
import { getCharacterAssets, CharacterAssets, CharacterId, CHARACTER_REGISTRY } from "@/lib/characters";

export function useCharacter(): {
  characterId: CharacterId;
  assets: CharacterAssets | null;
  isActive: boolean;
  characterName: string | null;
} {
  const { characterId } = useApp();
  const assets = getCharacterAssets(characterId);
  const characterName = CHARACTER_REGISTRY[characterId]?.name ?? null;
  return { characterId, assets, isActive: characterId !== "none", characterName };
}
