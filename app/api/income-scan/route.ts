import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getJSTDateString } from "@/lib/date";
import {
  buildPromptWithUploadedFile,
  deleteGeminiFile,
  extractFirstJsonObject,
  geminiClient,
  uploadGeminiFile,
  withGeminiRetry,
} from "@/lib/server/gemini";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type InputSource = {
  blob: Blob;
  mimeType: string;
  fileName: string;
  cleanup?: () => Promise<void>;
};

async function resolveInputSource(
  request: NextRequest,
  userId: string
): Promise<InputSource> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const mimeTypeEntry = formData.get("mimeType");

    if (!(fileEntry instanceof Blob)) {
      throw new Error("画像ファイルが必要です");
    }

    const file = fileEntry as File;
    const mimeType =
      (typeof mimeTypeEntry === "string" && mimeTypeEntry) ||
      file.type ||
      "image/jpeg";

    return {
      blob: file,
      mimeType,
      fileName: file.name || `income-${Date.now()}`,
    };
  }

  const { storagePath, mimeType } = await request.json();

  if (!storagePath) {
    throw new Error("画像パスが必要です");
  }

  if (!storagePath.startsWith(`${userId}/`)) {
    throw new Error("アクセス権限がありません");
  }

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("receipt-images")
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error("Storage download error:", downloadError);
    throw new Error("画像の取得に失敗しました");
  }

  return {
    blob: fileData,
    mimeType: mimeType || fileData.type || "image/jpeg",
    fileName: storagePath.split("/").pop() || `income-${Date.now()}`,
    cleanup: async () => {
      const { error } = await supabaseAdmin.storage
        .from("receipt-images")
        .remove([storagePath]);

      if (error) {
        console.warn("Storage削除エラー:", error);
      }
    },
  };
}

export async function POST(request: NextRequest) {
  let sourceCleanup: (() => Promise<void>) | undefined;
  let geminiFileName: string | null = null;

  try {
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

    const source = await resolveInputSource(request, user.id);
    sourceCleanup = source.cleanup;

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
- 日付が読み取れない場合は "${getJSTDateString()}" を使用してください
- 必ずJSON形式のみで返答してください`;

    const uploadedFile = await uploadGeminiFile(
      source.blob,
      source.mimeType,
      source.fileName
    );
    geminiFileName = uploadedFile.name || null;

    const result = await withGeminiRetry(() =>
      geminiClient.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: buildPromptWithUploadedFile(prompt, uploadedFile),
          },
        ],
      })
    );
    const text = result.text ?? "";

    console.log("Income scan Gemini response:", text);

    const incomeData = JSON.parse(extractFirstJsonObject(text));

    return NextResponse.json(incomeData);
  } catch (error) {
    console.error("Income scan error:", error);
    const message =
      error instanceof Error ? error.message : "収入書類の解析に失敗しました。";
    const status =
      message === "画像パスが必要です" || message === "画像ファイルが必要です"
        ? 400
        : message === "アクセス権限がありません"
          ? 403
          : 500;

    return NextResponse.json(
      { error: status === 500 ? "収入書類の解析に失敗しました。再度お試しください。" : message },
      { status }
    );
  } finally {
    await Promise.allSettled([
      sourceCleanup?.(),
      deleteGeminiFile(geminiFileName),
    ]);
  }
}
