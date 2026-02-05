// カテゴリー定義（大分類と小分類）
export const CATEGORY_LIST = [
  {
    main: "食費",
    icon: "🍔",
    sub: ["食料品", "外食", "カフェ・間食", "お菓子", "その他"],
  },
  {
    main: "日用品費",
    icon: "🛒",
    sub: ["消耗品", "雑貨", "レジ袋", "その他"],
  },
  {
    main: "住居費",
    icon: "🏠",
    sub: ["家賃・管理費", "家具・家電", "その他"],
  },
  {
    main: "水道・光熱費",
    icon: "💡",
    sub: ["電気代", "ガス代", "水道代"],
  },
  {
    main: "通信費",
    icon: "📱",
    sub: ["携帯電話", "インターネット"],
  },
  {
    main: "車両",
    icon: "🚗",
    sub: ["ガソリン代", "駐車場代", "自動車保険", "車検・整備", "その他"],
  },
  {
    main: "趣味・娯楽",
    icon: "🎮",
    sub: ["サブスクリプション", "旅行・レジャー", "映画", "ゲーム", "電子機器", "その他"],
  },
  {
    main: "交際費",
    icon: "🍻",
    sub: ["交際費", "飲み会"],
  },
  {
    main: "医療費",
    icon: "💊",
    sub: ["病院", "薬", "その他"],
  },
  {
    main: "交通費",
    icon: "🚃",
    sub: ["交通費", "道路料金", "その他"],
  },
  {
    main: "美容・衣服",
    icon: "👕",
    sub: ["衣服", "美容院・散髪", "その他"],
  },
  {
    main: "資金",
    icon: "💰",
    sub: ["銀行振り込み", "貯金・積立"],
  },
  {
    main: "その他",
    icon: "📦",
    sub: ["その他"],
  },
] as const;

// 型定義
export type CategoryMain = typeof CATEGORY_LIST[number]["main"];
export type CategoryItem = typeof CATEGORY_LIST[number];

// ヘルパー関数：大カテゴリーのアイコンを取得
export function getCategoryIcon(categoryMain: string): string {
  const category = CATEGORY_LIST.find(cat => cat.main === categoryMain);
  return category?.icon || "📦";
}

// ヘルパー関数：大カテゴリーに対応する小カテゴリーリストを取得
export function getSubcategories(categoryMain: string): string[] {
  const category = CATEGORY_LIST.find(cat => cat.main === categoryMain);
  return category?.sub ? [...category.sub] : ["その他"];
}

// ヘルパー関数：すべての大カテゴリー名を取得
export function getAllMainCategories(): string[] {
  return [...CATEGORY_LIST.map(cat => cat.main)];
}

// ヘルパー関数：カテゴリーが有効かチェック
export function isValidCategory(categoryMain: string, categorySub: string): boolean {
  const category = CATEGORY_LIST.find(cat => cat.main === categoryMain);
  if (!category) return false;
  return (category.sub as readonly string[]).includes(categorySub);
}

// Gemini用のカテゴリーリスト文字列を生成
export function generateCategoryListForPrompt(): string {
  return CATEGORY_LIST.map(cat => 
    `- ${cat.main}: ${cat.sub.join(", ")}`
  ).join("\n");
}
