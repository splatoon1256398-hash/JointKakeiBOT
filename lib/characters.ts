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

export interface CharacterThemeColors {
  primary: string;
  secondary: string;
  navBg: string;        // ナビバー背景
  navGlow: string;      // ナビバーグロー
  cardAccent: string;   // カード装飾色
}

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  description: string;
  previewImage: string;
  assets: CharacterAssets;
  themeColors: CharacterThemeColors;
  speeches: string[];   // キャラのセリフ集
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
    themeColors: {
      primary: "#4A8FCA",
      secondary: "#7DB5E8",
      navBg: "rgba(74, 143, 202, 0.25)",
      navGlow: "rgba(125, 181, 232, 0.3)",
      cardAccent: "rgba(125, 181, 232, 0.15)",
    },
    speeches: [
      "今日も節約がんばろ〜！",
      "いい感じ！✨",
      "家計簿つけてえらい！",
      "一緒にがんばろ！💪",
      "ヤッホー！🎉",
      "ナイス記録！📝",
      "コツコツが大事だよ〜",
      "お金の管理、バッチリ！",
    ],
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
