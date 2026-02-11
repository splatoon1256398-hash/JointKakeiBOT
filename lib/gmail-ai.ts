import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "");

export interface ParsedTransaction {
  date: string;
  amount: number;
  store: string;
  category_main: string;
  category_sub: string;
  memo: string;
}

/** 複数商品対応の戻り値 */
export interface ParsedEmailResult {
  is_transaction: boolean;
  items: ParsedTransaction[];
}

interface GmailFilter {
  filter_type: "WHITELIST" | "BLACKLIST";
  target_type: "SUBJECT" | "SENDER";
  keyword: string;
}

export interface CategoryDefinition {
  main_category: string;
  subcategories: string[];
}

/**
 * フィルタを適用してメールを処理すべきか判定
 */
export function shouldProcessEmail(
  subject: string,
  sender: string,
  filters: GmailFilter[]
): boolean {
  const whitelists = filters.filter((f) => f.filter_type === "WHITELIST");
  const blacklists = filters.filter((f) => f.filter_type === "BLACKLIST");

  for (const bl of blacklists) {
    const target = bl.target_type === "SUBJECT" ? subject : sender;
    if (target.toLowerCase().includes(bl.keyword.toLowerCase())) {
      return false;
    }
  }

  if (whitelists.length > 0) {
    const matches = whitelists.some((wl) => {
      const target = wl.target_type === "SUBJECT" ? subject : sender;
      return target.toLowerCase().includes(wl.keyword.toLowerCase());
    });
    if (!matches) return false;
  }

  return true;
}

/**
 * Gemini AI でメール本文から取引情報を解析（複数商品対応）
 * @param categories DBから取得したカテゴリ一覧
 * @returns 複数のParsedTransactionを含むResult、またはnull
 */
export async function parseEmailWithAI(
  emailBody: string,
  subject: string,
  categories?: CategoryDefinition[]
): Promise<ParsedTransaction[] | null> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            is_transaction: { type: SchemaType.BOOLEAN },
            items: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  date: { type: SchemaType.STRING },
                  amount: { type: SchemaType.NUMBER },
                  store: { type: SchemaType.STRING },
                  category_main: { type: SchemaType.STRING },
                  category_sub: { type: SchemaType.STRING },
                  memo: { type: SchemaType.STRING },
                },
                required: ["date", "amount", "store", "category_main", "category_sub", "memo"],
              },
            },
          },
          required: ["is_transaction"],
        },
      },
    });

    let categoryInstruction: string;
    if (categories && categories.length > 0) {
      const catLines = categories.map(
        (c) => `- ${c.main_category}: [${c.subcategories.join(", ")}]`
      );
      categoryInstruction = `以下のカテゴリ一覧の中から **必ず** 既存の名称を使って選んでください。一覧にないカテゴリ名を生成しないでください。

${catLines.join("\n")}`;
    } else {
      categoryInstruction = `カテゴリー（大分類）の候補：食費, 日用品費, 住居費, 水道・光熱費, 通信費, 車両, 交通費, 医療費, 教育費, 娯楽費, 被服費, 美容費, 保険料, 交際費, その他
小分類は適切なものを推測してください。`;
    }

    const prompt = `以下のメールから決済・取引情報を抽出してください。
決済メールでない場合は is_transaction: false, items: [] を返してください。

【重要: 複数商品対応】
- 1通のメールに複数の商品がある場合（Amazon注文確認、まとめ買い等）、items配列に個別に登録してください。
- 各itemのmemoには「Gmail自動：件名」ではなく、AIが抽出した**具体的な商品名**をセットしてください。
  - 例: memo="UGREEN LANケーブル CAT8 2m" のように具体的に
  - 商品名が不明な場合のみ件名から推測してください
- 各itemのstoreには店名・サービス名を入れてください（Amazon, 楽天市場, etc）

${categoryInstruction}

件名: ${subject}

メール本文:
${emailBody.substring(0, 4000)}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed: ParsedEmailResult = JSON.parse(text);

    if (!parsed.is_transaction || !parsed.items || parsed.items.length === 0) {
      return null;
    }

    // 各itemをバリデーション
    const validItems = parsed.items
      .filter((item) => item.amount > 0)
      .map((item) => ({
        date: item.date || new Date().toISOString().split("T")[0],
        amount: item.amount,
        store: item.store || "",
        category_main: item.category_main || "その他",
        category_sub: item.category_sub || "その他",
        memo: item.memo || "",
      }));

    return validItems.length > 0 ? validItems : null;
  } catch (error) {
    console.error("Gmail AI parse error:", error);
    return null;
  }
}
