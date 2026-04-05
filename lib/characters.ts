// キャラクター着せ替えシステムの設定

export type CharacterId = "none" | "hachiware";

export interface CharacterAssets {
  splash: string;
  avatar: string;
  scanning: string;
  watermark: string;
  empty: string;
  navHome: string;
  navKakeibo: string;
  navRecord: string;
  navSavings: string;
  navChat: string;
  menuExpense?: string;
  menuIncome?: string;
  menuSavings?: string;
  success?: string;
}

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  description: string;
  previewImage: string;
  assets: CharacterAssets;
}

const HACHIWARE_BASE = "/characters/hachiware";

export const CHARACTER_REGISTRY: Record<CharacterId, CharacterConfig | null> = {
  none: null,
  hachiware: {
    id: "hachiware",
    name: "ハチワレ",
    description: "ちいかわのハチワレがアプリに登場！",
    previewImage: `${HACHIWARE_BASE}/preview.png`,
    assets: {
      splash: `${HACHIWARE_BASE}/splash.png`,
      avatar: `${HACHIWARE_BASE}/avatar.png`,
      scanning: `${HACHIWARE_BASE}/scanning.png`,
      watermark: `${HACHIWARE_BASE}/watermark.png`,
      empty: `${HACHIWARE_BASE}/empty.png`,
      navHome: `${HACHIWARE_BASE}/nav-home.png`,
      navKakeibo: `${HACHIWARE_BASE}/nav-kakeibo.png`,
      navRecord: `${HACHIWARE_BASE}/nav-record.png`,
      navSavings: `${HACHIWARE_BASE}/nav-savings.png`,
      navChat: `${HACHIWARE_BASE}/nav-chat.png`,
      menuExpense: `${HACHIWARE_BASE}/menu-expense.png`,
      menuIncome: `${HACHIWARE_BASE}/menu-income.png`,
      menuSavings: `${HACHIWARE_BASE}/menu-savings.png`,
      success: `${HACHIWARE_BASE}/success.png`,
    },
  },
};

export const CHARACTER_LIST: CharacterConfig[] = Object.values(CHARACTER_REGISTRY).filter(
  (c): c is CharacterConfig => c !== null
);

export function getCharacterAssets(id: CharacterId): CharacterAssets | null {
  return CHARACTER_REGISTRY[id]?.assets ?? null;
}

export function isValidCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && value in CHARACTER_REGISTRY;
}
