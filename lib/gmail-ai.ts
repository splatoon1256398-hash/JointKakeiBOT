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
 * Gemini AI でメール本文から取引情報を解析
 * @param categories DBから取得したカテゴリ一覧。渡された場合はその中からのみ選択する
 */
export async function parseEmailWithAI(
  emailBody: string,
  subject: string,
  categories?: CategoryDefinition[]
): Promise<ParsedTransaction | null> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            is_transaction: { type: SchemaType.BOOLEAN },
            date: { type: SchemaType.STRING },
            amount: { type: SchemaType.NUMBER },
            store: { type: SchemaType.STRING },
            category_main: { type: SchemaType.STRING },
            category_sub: { type: SchemaType.STRING },
            memo: { type: SchemaType.STRING },
          },
          required: ["is_transaction"],
        },
      },
    });

    // カテゴリ一覧をプロンプトに埋め込み
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
決済メールでない場合は is_transaction: false を返してください。

${categoryInstruction}

件名: ${subject}

メール本文:
${emailBody.substring(0, 3000)}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (!parsed.is_transaction) {
      return null;
    }

    return {
      date: parsed.date || new Date().toISOString().split("T")[0],
      amount: parsed.amount || 0,
      store: parsed.store || "",
      category_main: parsed.category_main || "その他",
      category_sub: parsed.category_sub || "その他",
      memo: parsed.memo || "",
    };
  } catch (error) {
    console.error("Gmail AI parse error:", error);
    return null;
  }
}
