import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// サーバーサイド専用（APIルートからのみ使用）
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRetryable = error instanceof Error && (
        error.message?.includes('503') ||
        error.message?.includes('429') ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('UNAVAILABLE') ||
        error.message?.includes('DEADLINE_EXCEEDED')
      );
      if (attempt < maxRetries && isRetryable) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Gmail AI retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable');
}

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
  categories?: CategoryDefinition[],
  receivedDate?: string
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

    const today = new Date().toISOString().split('T')[0];
    const dateToUse = receivedDate || today;

    const prompt = `以下のメールから決済・取引情報を抽出してください。
決済メールでない場合は is_transaction: false, items: [] を返してください。

【最重要: 日付の決定ルール】
- このメールの受信日は「${dateToUse}」です。
- 各itemのdateには、この受信日「${dateToUse}」を使用してください。
- メール本文中に別の日付があっても、受信日を最優先で採用せよ。

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

    const result = await withRetry(() => model.generateContent(prompt));
    const text = result.response.text();
    const parsed: ParsedEmailResult = JSON.parse(text);

    if (!parsed.is_transaction || !parsed.items || parsed.items.length === 0) {
      return null;
    }

    // 各itemをバリデーション + カテゴリDB検証
    const catMap: Record<string, string[]> = {};
    categories?.forEach(c => { catMap[c.main_category] = c.subcategories || []; });

    const validItems = parsed.items
      .filter((item) => item.amount > 0)
      .map((item) => {
        let catMain = item.category_main || "その他";
        let catSub = item.category_sub || "その他";
        // DBに存在しないcatMain→その他
        if (categories && categories.length > 0 && !catMap[catMain]) catMain = "その他";
        const validSubs = catMap[catMain] || ["その他"];
        if (!validSubs.includes(catSub)) catSub = validSubs[0] || "その他";
        return {
          date: item.date || dateToUse,
          amount: item.amount,
          store: item.store || "",
          category_main: catMain,
          category_sub: catSub,
          memo: item.memo || "",
        };
      });

    return validItems.length > 0 ? validItems : null;
  } catch (error) {
    console.error("Gmail AI parse error:", error);
    return null;
  }
}
