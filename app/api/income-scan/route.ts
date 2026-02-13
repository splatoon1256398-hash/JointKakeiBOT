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
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    const { imageBase64, mimeType } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "画像データが必要です" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const base64Data = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType || "image/jpeg",
      },
    };

    const prompt = `この給与明細・収入書類の画像/PDFを解析して、以下のJSON形式で情報を抽出してください。

【抽出ルール】
1. **差引支給額（手取り）** を "net_amount" として取得 → これが家計簿に記録する「収入額」
2. **総支給額（額面）** を "gross_amount" として取得
3. 会社名、〇月分給与などの情報を "memo" に記載
4. 支給日付を "date" に記載（見つからなければ今月1日）
5. 収入源（会社名など）を "source" に記載

【出力形式】
{
  "date": "YYYY-MM-DD",
  "net_amount": 290740,
  "gross_amount": 362248,
  "source": "株式会社〇〇",
  "memo": "2月分給与",
  "category_main": "給与・賞与",
  "category_sub": "給与"
}

- 賞与の場合は category_sub を "賞与" にしてください
- 副業やフリーランスの場合は category_main を "副業" にしてください
- 金額が読み取れない場合は 0 にしてください。捏造は禁止です
- 日付が読み取れない場合は "${new Date().toISOString().split("T")[0]}" を使用してください
- 必ずJSON形式のみで返答してください`;

    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response.text();

    console.log("Income scan Gemini response:", text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("JSONが見つかりませんでした");
    }

    const incomeData = JSON.parse(jsonMatch[0]);

    return NextResponse.json(incomeData);
  } catch (error) {
    console.error("Income scan error:", error);
    return NextResponse.json(
      {
        date: new Date().toISOString().split("T")[0],
        net_amount: 0,
        gross_amount: 0,
        source: "",
        memo: "手動で入力してください",
        category_main: "給与・賞与",
        category_sub: "給与",
      }
    );
  }
}
