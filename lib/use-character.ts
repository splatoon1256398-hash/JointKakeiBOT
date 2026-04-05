"use client";

import { useApp } from "@/contexts/app-context";
import { getCharacterAssets, CharacterAssets, CharacterId, CHARACTER_REGISTRY, CharacterThemeColors } from "@/lib/characters";

export function useCharacter(): {
  characterId: CharacterId;
  assets: CharacterAssets | null;
  isActive: boolean;
  characterName: string | null;
  themeColors: CharacterThemeColors | null;
  speeches: string[];
} {
  const { characterId } = useApp();
  const config = CHARACTER_REGISTRY[characterId];
  const assets = getCharacterAssets(characterId);
  const characterName = config?.name ?? null;
  const themeColors = config?.themeColors ?? null;
  const speeches = config?.speeches ?? [];
  return { characterId, assets, isActive: characterId !== "none", characterName, themeColors, speeches };
}
