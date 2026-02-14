import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: "認証に失敗しました" },
        { status: 401 }
      );
    }

    const { imageBase64, mimeType } = await request.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "画像データが必要です" },
        { status: 400 }
      );
    }

    // DBからカテゴリーリストを取得
    const { data: catData } = await supabaseAdmin
      .from("categories")
      .select("main_category, subcategories")
      .order("sort_order");

    const categoryList =
      catData
        ?.map(
          (cat) =>
            `- ${cat.main_category}: ${cat.subcategories.join(", ")}`
        )
        .join("\n") || "- その他: その他";

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    // Base64データの整形
    const base64Data = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType || "image/jpeg",
      },
    };

    const prompt = `このレシート画像/PDFを詳細に解析して、以下のJSON形式で情報を抽出してください：

【最重要ルール: 合計金額（税込）の絶対視】
- レシートに印字されている「合計金額（税込）」「お支払い金額」を totalAmount として最優先で取得せよ。これが家計簿の正解金額となる。
- totalAmount は絶対に変えるな。レシートの支払総額そのものを使え。

【品目の抽出ルール — 税率・金額の捏造禁止】
1. 品目ごとの価格は、レシートに印字されている数値をそのまま返せ
2. 税抜き価格が印字されているなら税抜きのまま返せ。税込み価格が印字されているなら税込みのまま返せ
3. **自分で消費税（8%や10%）を掛けたり割ったりして金額を変換してはいけない**
4. 品目合計と totalAmount が一致しなくても問題ない（プログラム側で自動按分する）
5. 各商品に適切な大カテゴリーと小カテゴリーを割り当ててください
6. 「値引き」や「割引」は独立した商品として扱わず、該当する商品の金額から差し引いてください
7. **必ず以下のカテゴリーリストの中から選択してください（他のカテゴリーは使用禁止）**

【使用可能なカテゴリー一覧】
${categoryList}

【カテゴリー選択の厳密なルール】
- categoryMainは上記リストの大分類から**必ず**選択してください
- categorySubは選択した大分類に対応する小分類から**必ず**選択してください
- リストにないカテゴリーは絶対に使用しないでください
- 判断に迷う場合は「その他」カテゴリーを使用してください

【出力形式】
{
  "date": "YYYY-MM-DD",
  "items": [
    {
      "categoryMain": "食費",
      "categorySub": "食料品",
      "storeName": "店名",
      "amount": 254,
      "memo": "卵"
    }
  ],
  "totalAmount": 9522
}

- 各itemのmemoは個別商品名を書け（「野菜、肉など」のようにまとめるな）
- 同じカテゴリーの商品でもまとめずに1品1itemで出力せよ
- 【カタカナ略称の翻訳】レシートの品目名がカタカナ略称の場合（例：ニユウリヨウ→牛乳、ニク→肉、タマゴ→卵、ﾊﾟﾝ→パン、ﾓﾔｼ→もやし）、自然な日本語の商品名に変換してからmemoに書け。半角カタカナも同様に変換せよ。
- 日付が読み取れない場合は、今日の日付（${new Date().toISOString().split("T")[0]}）を使用してください
- 必ずJSON形式のみで返答してください（他の文字は含めないでください）`;

    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response.text();

    console.log("Receipt API Gemini Response:", text);

    // JSONを抽出（マークダウンのコードブロックを除去）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("JSONが見つかりませんでした");
    }

    const receiptData = JSON.parse(jsonMatch[0]);

    if (!receiptData.items || receiptData.items.length === 0) {
      throw new Error("項目が見つかりませんでした");
    }

    // ===== 按分ロジック: totalAmount を基準に各品目を税込概算に変換 =====
    const totalAmount = receiptData.totalAmount || 0;
    const itemsSum = receiptData.items.reduce(
      (sum: number, item: { amount: number }) => sum + item.amount,
      0
    );

    if (totalAmount > 0 && itemsSum > 0 && itemsSum !== totalAmount) {
      // 品目合計 ≠ 合計金額 → プロポーショナル按分で税込概算に変換
      const ratio = totalAmount / itemsSum;
      let distributed = 0;
      receiptData.items = receiptData.items.map(
        (
          item: { amount: number; [key: string]: unknown },
          idx: number
        ) => {
          if (idx === receiptData.items.length - 1) {
            // 最後の項目で端数調整（1円単位の誤差を吸収）
            return { ...item, amount: totalAmount - distributed };
          }
          const adjusted = Math.round(item.amount * ratio);
          distributed += adjusted;
          return { ...item, amount: adjusted };
        }
      );
    }

    return NextResponse.json(receiptData);
  } catch (error) {
    console.error("Receipt analysis error:", error);
    return NextResponse.json({
      date: new Date().toISOString().split("T")[0],
      items: [
        {
          categoryMain: "食費",
          categorySub: "食料品",
          storeName: "不明",
          amount: 0,
          memo: "手動で入力してください",
        },
      ],
      totalAmount: 0,
    });
  }
}
