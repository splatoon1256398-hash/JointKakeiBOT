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
- レシートに印字されている「合計金額（税込）」「お支払い金額」「合計」を totalAmount として最優先で取得せよ。これが家計簿の正解金額となる。
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

【カタカナ略称・品名の自然な日本語翻訳ルール（最重要）】
レシート特有のカタカナ略称や半角カナを、人間が直感的に読める自然な日本語に翻訳してmemoに書け。
具体的な変換例:
- ヨウニンジン → 葉ニンジン
- ブナシメジ → ぶなしめじ
- ギョウザタレ → 餃子のタレ
- アイビキミンチ → 合挽きミンチ
- ニユウリヨウ → 入浴料
- ﾓﾔｼ → もやし
- ﾊﾟﾝ → パン
- ﾎﾟﾃﾄﾁｯﾌﾟｽ → ポテトチップス
- タマゴ → 卵
- トリムネ → 鶏むね肉
- ギュウニュウ → 牛乳
- ハクサイ → 白菜
- ダイコン → 大根
- レイトウショクヒン → 冷凍食品

**ルール:**
- 意味が推測できるものは自然な漢字仮名混じりに変換する
- 商品名が不明瞭な場合は、推測せずレシートの表記を維持しつつ、半角→全角カナ変換など読みやすさのみを改善する
- 「ニク」「ヤサイ」のような極端に短い略称は「肉」「野菜」に変換する
- ブランド名・固有名詞はそのまま維持する

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

    // ===== 按分ロジック: totalAmount を「絶対の真実」として各品目を税込価格に同期 =====
    const totalAmount = receiptData.totalAmount || 0;
    const rawItems = receiptData.items || [];

    // 品目が0件でもtotalAmountがあれば1品目として返す
    if (rawItems.length === 0 && totalAmount > 0) {
      receiptData.items = [{
        categoryMain: "その他",
        categorySub: "その他",
        storeName: "不明",
        amount: totalAmount,
        memo: "手動で入力してください",
      }];
    } else if (rawItems.length > 0 && totalAmount > 0) {
      const itemsSum = rawItems.reduce(
        (sum: number, item: { amount: number }) => sum + (item.amount || 0),
        0
      );

      if (itemsSum > 0 && itemsSum !== totalAmount) {
        // 品目合計 ≠ 合計金額 → 表示価格 = 品目単価 × (totalAmount / itemsSum) で按分
        const ratio = totalAmount / itemsSum;
        let distributed = 0;
        receiptData.items = rawItems.map(
          (
            item: { amount: number; [key: string]: unknown },
            idx: number
          ) => {
            if (idx === rawItems.length - 1) {
              // 最後の項目で端数調整（1円単位の誤差を吸収）
              return { ...item, amount: totalAmount - distributed };
            }
            const adjusted = Math.round((item.amount || 0) * ratio);
            distributed += adjusted;
            return { ...item, amount: adjusted };
          }
        );
      } else if (itemsSum === 0) {
        // 全品目が0円 → 均等割り
        const each = Math.floor(totalAmount / rawItems.length);
        let distributed = 0;
        receiptData.items = rawItems.map(
          (item: { [key: string]: unknown }, idx: number) => {
            if (idx === rawItems.length - 1) {
              return { ...item, amount: totalAmount - distributed };
            }
            distributed += each;
            return { ...item, amount: each };
          }
        );
      }
      // itemsSum === totalAmount の場合はそのまま（調整不要）
    }

    // items の amount が負数にならないようガード
    receiptData.items = (receiptData.items || []).map(
      (item: { amount: number; [key: string]: unknown }) => ({
        ...item,
        amount: Math.max(item.amount || 0, 0),
      })
    );

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
