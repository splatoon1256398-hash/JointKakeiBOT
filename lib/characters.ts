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
  runner?: string;
  peek?: string;
  pattern?: string;
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
  preloadAssetKeys?: Array<keyof CharacterAssets>;
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
      runner: `${HACHIWARE_BASE}/runner.png`,
      peek: `${HACHIWARE_BASE}/peek.png`,
      success: `${HACHIWARE_BASE}/success.png`,
    },
    themeColors: {
      primary: "#5EB1E5",
      secondary: "#B8E7F8",
      navBg: "rgba(201, 237, 250, 0.42)",
      navGlow: "rgba(184, 231, 248, 0.58)",
      cardAccent: "rgba(255, 248, 204, 0.18)",
    },
    preloadAssetKeys: [
      "splash",
      "avatar",
      "scanning",
      "navHome",
      "navKakeibo",
      "navRecord",
      "navSavings",
      "navChat",
      "runner",
      "peek",
      "success",
    ],
    speeches: [
      "今日も節約がんばろ〜！",
      "記録できたッ！",
      "レシート読むね〜",
      "予算、見守ってるよ",
      "あと少しで黒字かも！",
      "ムリなくいこ〜",
      "外食メモした？",
      "貯金、いい感じ！",
      "明細チェックするね",
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
