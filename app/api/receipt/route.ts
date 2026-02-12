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

【重要な解析ルール】
1. レシート内の商品を、カテゴリーごとにグループ化してください
2. 「値引き」や「割引」は独立した商品として扱わず、該当する商品の金額から差し引いてください
3. 各商品に適切な大カテゴリーと小カテゴリーを割り当ててください
4. 同じカテゴリーの商品は1つの項目にまとめてください
5. **必ず以下のカテゴリーリストの中から選択してください（他のカテゴリーは使用禁止）**

【税込み計算ルール（重要）】
- レシートに表示されている価格が「税抜き」の場合、以下の税率で税込みに変換してください：
  - 食品（飲食料品）→ 軽減税率 8%（税抜き価格 × 1.08）
  - その他（日用品、衣料品、サービスなど）→ 標準税率 10%（税抜き価格 × 1.10）
  - 外食・酒類 → 標準税率 10%
- レシートに「(税込)」「内税」と記載がある場合、または「合計」欄の金額が税込みの場合はそのまま使用
- 各itemの amount は**必ず税込み金額**で出力してください
- totalAmount は**レシートの支払総額**（税込）と一致させてください
- レシートに「お支払い金額」「合計」が表示されている場合、その金額を totalAmount として使用してください

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
      "amount": 1234,
      "memo": "野菜、肉など（税込み）"
    }
  ],
  "totalAmount": 1234
}

日付が読み取れない場合は、今日の日付（${new Date().toISOString().split("T")[0]}）を使用してください。
必ずJSON形式のみで返答してください（他の文字は含めないでください）。`;

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
