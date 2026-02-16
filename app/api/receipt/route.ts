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

    const { storagePath, mimeType } = await request.json();

    if (!storagePath) {
      return NextResponse.json(
        { error: "画像パスが必要です" },
        { status: 400 }
      );
    }

    // Supabase Storageから画像をダウンロード
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("receipt-images")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json(
        { error: "画像の取得に失敗しました" },
        { status: 500 }
      );
    }

    // Blobをbase64に変換（Gemini APIに渡すため）
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    console.log(`Storage画像取得: ${storagePath} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB)`);

    // 処理後にStorageから削除（非同期・エラーでも継続）
    supabaseAdmin.storage
      .from("receipt-images")
      .remove([storagePath])
      .then(({ error: delErr }) => {
        if (delErr) console.warn("Storage削除エラー:", delErr);
        else console.log("Storage画像削除完了:", storagePath);
      });

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

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType || "image/jpeg",
      },
    };

    const prompt = `このレシート画像/PDFを解析して、以下のJSON形式で情報を抽出してください：

【最重要: totalAmountの絶対視】
- レシートの「合計」「お支払い」「税込合計」を totalAmount として取得。これが絶対の正解。

【品目抽出ルール】
1. 各品目の価格はレシート印字のまま返せ（税抜きなら税抜き、税込みなら税込み）
2. 自分で税率を掛けたり割ったりして金額を変換するな
3. 品目合計とtotalAmountが一致しなくてOK（プログラム側で自動按分する）

【❗絶対禁止: 以下を独立した品目として出力するな】
- 「割引」「値引き」「クーポン」「○%引」「-○円」→ 該当商品の価格から差し引いてから出力せよ
- 「消費税」「内税」「外税」→ 絶対に品目として出力するな
- 「小計」「合計」「お釣り」「預かり」→ 品目として出力するな

具体例:
レシートに「鶏肉 497円」「割引 -99円」とある場合 → itemsには { "memo": "鶏肉", "amount": 398 } の1件のみ出力。割引行は絶対に出力しない。

【カテゴリー選択】
- 必ず以下のリストから選択（他のカテゴリーは使用禁止）
- 判断に迷う場合は「その他」を使用

【使用可能なカテゴリー一覧】
${categoryList}

【カタカナ略称・品名の自然な日本語翻訳】
レシート特有のカタカナ略称や半角カナを自然な日本語に翻訳してmemoに書け。
例: ヨウニンジン→葉ニンジン, ブナシメジ→ぶなしめじ, ﾓﾔｼ→もやし, タマゴ→卵, トリムネ→鶏むね肉, ギュウニュウ→牛乳
ブランド名・固有名詞はそのまま維持。不明瞭な場合は半角→全角カナ変換のみ。

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

    // ===== 前処理: AIが割引・税金を独立品目として返した場合の救済 =====
    const totalAmount = receiptData.totalAmount || 0;
    let rawItems: Array<{ amount: number; memo?: string; [key: string]: unknown }> = receiptData.items || [];

    // 割引行（負の金額または割引キーワード）を検出し、直前の商品に吸収
    const discountKeywords = /割引|値引|クーポン|％引|%引|小計|合計|お釣り|預かり|消費税|内税|外税|税/;
    const cleanedItems: typeof rawItems = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const memo = (item.memo || '').toString();
      const amount = item.amount || 0;

      // 負の金額 → 直前の商品に吸収してスキップ
      if (amount < 0) {
        if (cleanedItems.length > 0) {
          cleanedItems[cleanedItems.length - 1].amount = Math.max(
            (cleanedItems[cleanedItems.length - 1].amount || 0) + amount,
            0
          );
        }
        continue;
      }

      // 割引・税金・小計キーワード → スキップ
      if (discountKeywords.test(memo)) continue;

      // 金額0の非商品行もスキップ
      if (amount <= 0) continue;

      cleanedItems.push({ ...item });
    }

    rawItems = cleanedItems;

    // ===== 按分ロジック: totalAmount を「絶対の真実」として各品目を税込価格に同期 =====
    if (rawItems.length === 0 && totalAmount > 0) {
      receiptData.items = [{
        categoryMain: "その他",
        categorySub: "その他",
        storeName: "不明",
        amount: totalAmount,
        memo: "手動で入力してください",
      }];
    } else if (rawItems.length > 0 && totalAmount > 0) {
      const itemsSum = rawItems.reduce((sum, item) => sum + (item.amount || 0), 0);

      if (itemsSum > 0 && itemsSum !== totalAmount) {
        // 品目合計 ≠ 合計金額 → totalAmountを基準に按分
        const ratio = totalAmount / itemsSum;
        let distributed = 0;
        receiptData.items = rawItems.map((item, idx) => {
          if (idx === rawItems.length - 1) {
            return { ...item, amount: totalAmount - distributed };
          }
          const adjusted = Math.round((item.amount || 0) * ratio);
          distributed += adjusted;
          return { ...item, amount: adjusted };
        });
      } else if (itemsSum === 0) {
        const each = Math.floor(totalAmount / rawItems.length);
        let distributed = 0;
        receiptData.items = rawItems.map((item, idx) => {
          if (idx === rawItems.length - 1) {
            return { ...item, amount: totalAmount - distributed };
          }
          distributed += each;
          return { ...item, amount: each };
        });
      } else {
        receiptData.items = rawItems;
      }
    } else {
      receiptData.items = rawItems;
    }

    // 最終ガード: amountが負数にならないように + categorySubのバリデーション
    const catMap: Record<string, string[]> = {};
    catData?.forEach((cat) => {
      catMap[cat.main_category] = cat.subcategories || [];
    });

    receiptData.items = (receiptData.items || []).map(
      (item: { amount: number; categoryMain?: string; categorySub?: string; [key: string]: unknown }) => {
        const main = item.categoryMain || "その他";
        let sub = item.categorySub;
        // categorySubがnull/undefined/空、またはDB上に存在しない場合 → デフォルト（1番目）に強制
        const validSubs = catMap[main] || catMap["その他"] || ["その他"];
        if (!sub || !validSubs.includes(sub)) {
          sub = validSubs[0] || "その他";
        }
        // categoryMainもDB上に存在しない場合 → 「その他」に強制
        const validMain = catMap[main] ? main : "その他";
        const validSubForMain = catMap[validMain] || ["その他"];
        if (!validSubForMain.includes(sub)) {
          sub = validSubForMain[0] || "その他";
        }
        return {
          ...item,
          categoryMain: validMain,
          categorySub: sub,
          amount: Math.max(item.amount || 0, 0),
        };
      }
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
