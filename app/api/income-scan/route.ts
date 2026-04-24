import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getJSTDateString } from "@/lib/date";
import {
  blobToInlinePart,
  buildPromptWithUploadedFile,
  deleteGeminiFile,
  extractFirstJsonObject,
  geminiClient,
  INLINE_LIMIT_BYTES,
  uploadGeminiFile,
  withGeminiRetry,
} from "@/lib/server/gemini";
import { createTimer } from "@/lib/server/perf";
import { verifyAccessToken } from "@/lib/server/auth";
import { assertSafeUserScopedPath } from "@/lib/server/storage-path";
import { parseBody, StorageScanRequestSchema } from "@/lib/server/schemas";
import type { Part } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = ["hnd1"];

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

  const rawBody = await request.json().catch(() => null);
  const { storagePath, mimeType } = parseBody(StorageScanRequestSchema, rawBody);
  assertSafeUserScopedPath(storagePath, userId);

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
  const timer = createTimer();
  let sourceCleanup: (() => Promise<void>) | undefined;
  let geminiFileName: string | null = null;

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    // Phase 6-B: jose でローカル検証 (RTT 削除)
    const user = await verifyAccessToken(token);
    if (!user) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }
    timer.mark("auth");

    const source = await resolveInputSource(request, user.id);
    sourceCleanup = source.cleanup;
    timer.mark("prepare");

    const head = Buffer.from(
      await source.blob.slice(0, 8).arrayBuffer()
    ).toString("hex");
    console.log(
      "[income-scan] input:",
      JSON.stringify({
        size: source.blob.size,
        mimeType: source.mimeType,
        fileName: source.fileName,
        head8: head,
      })
    );

    // PDF と宣言されているのに中身が %PDF- で始まらない場合、Gemini に投げても
    // "The document has no pages." になるだけなので事前に弾く。
    // 実例: 会社ポータルの認証切れ時に HTML が .pdf 拡張子で降ってくるケース。
    if (source.mimeType === "application/pdf" && !head.startsWith("25504446")) {
      await source.cleanup?.();
      sourceCleanup = undefined;
      return NextResponse.json(
        {
          error:
            "このファイルはPDFとして開けませんでした。ポータルから再ダウンロードするか、スクリーンショットを画像として送ってください。",
        },
        { status: 400 }
      );
    }

    // 短縮プロンプト (responseMimeType=JSON で形式強制、要点のみ)
    const prompt = `給与明細/収入書類を解析し JSON のみで返答。

【取得項目】
- net_amount: 差引支給額（手取り）= 家計簿に記録する収入額
- gross_amount: 総支給額（額面）
- date: 支給日（なければ当月1日）
- source: 会社名など収入源
- memo: 「○月分給与」など
- category_main: 給与時は「給与・賞与」、副業/フリーランス時は「副業」
- category_sub: 基本「給与」、賞与時は「賞与」

【出力形式】
{"date":"YYYY-MM-DD","net_amount":290740,"gross_amount":362248,"source":"株式会社〇〇","memo":"2月分給与","category_main":"給与・賞与","category_sub":"給与"}

- 金額が読めなければ 0（捏造禁止）
- 日付不明時は "${getJSTDateString()}"`;

    // === inline 優先経路 ===
    // PDF も inline 可 (Gemini は 20MB まで base64 PDF 対応)。
    // Files API は state=ACTIVE 直後の "document has no pages" レースが出るため、
    // 4MB 以下の給与明細 PDF は inline に寄せて事故を避ける。
    const useInline = source.blob.size <= INLINE_LIMIT_BYTES;

    let parts: Part[];
    if (useInline) {
      parts = [
        { text: prompt },
        await blobToInlinePart(source.blob, source.mimeType),
      ];
      timer.mark("upload");
    } else {
      const uploadedFile = await uploadGeminiFile(
        source.blob,
        source.mimeType,
        source.fileName
      );
      geminiFileName = uploadedFile.name || null;
      parts = buildPromptWithUploadedFile(prompt, uploadedFile);
      timer.mark("upload");
    }

    // モデル: gemini-3-flash-preview (元コードと同じ、動作実績あり)
    const result = await withGeminiRetry(() =>
      geminiClient.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts }],
      })
    );
    const text = result.text ?? "";
    const finishReason = result.candidates?.[0]?.finishReason;
    timer.mark("inference");

    console.log("Income scan Gemini response length:", text.length, "finishReason:", finishReason);

    let incomeData;
    try {
      incomeData = JSON.parse(extractFirstJsonObject(text));
    } catch (parseErr) {
      console.error("[income-scan] JSON parse failed. text length:", text.length, "finishReason:", finishReason, "text tail:", text.slice(-500), "err:", (parseErr as Error).message);
      throw new Error(`収入書類の解析結果が不正な形式でした (finish=${finishReason || "?"}, len=${text.length})`);
    }

    // クリーンアップは after() でバックグラウンド
    const pendingCleanup = { sourceCleanup, geminiFileName };
    sourceCleanup = undefined;
    geminiFileName = null;
    after(async () => {
      const cleanupTimer = createTimer();
      await Promise.allSettled([
        pendingCleanup.sourceCleanup?.(),
        deleteGeminiFile(pendingCleanup.geminiFileName),
      ]);
      console.log(`[income-scan] cleanup done in ${cleanupTimer.elapsed().toFixed(0)}ms`);
    });
    timer.mark("cleanup_enqueued");

    incomeData._perf = timer.toRecord();
    console.log("[income-scan] perf:", JSON.stringify(incomeData._perf), "useInline:", useInline, "blobSize:", source.blob.size);
    return NextResponse.json(incomeData, {
      headers: { "Server-Timing": timer.toServerTiming() },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error("[income-scan] FAILED:", errMsg, "|", errStack?.split("\n").slice(0, 5).join(" || "));
    await Promise.allSettled([
      sourceCleanup?.(),
      deleteGeminiFile(geminiFileName),
    ]);
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
  }
}
