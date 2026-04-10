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
import type { Part } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 30;
export const preferredRegion = ["hnd1"]; // 東京リージョン (Supabase と同一に)

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

type CategoryRow = {
  main_category: string;
  subcategories: string[];
};

// データ + 事前ビルド済みプロンプト用文字列をまとめてキャッシュ
// → 毎リクエストの string 構築コストを削減
let cachedCategories:
  | {
      data: CategoryRow[];
      categoryList: string;
      expiresAt: number;
    }
  | null = null;

async function getCachedCategories(): Promise<{ data: CategoryRow[]; categoryList: string }> {
  if (cachedCategories && cachedCategories.expiresAt > Date.now()) {
    return { data: cachedCategories.data, categoryList: cachedCategories.categoryList };
  }

  const { data } = await supabaseAdmin
    .from("categories")
    .select("main_category, subcategories")
    .order("sort_order");

  const normalized = (data || []).map((category) => ({
    main_category: category.main_category,
    subcategories: category.subcategories || [],
  }));

  const categoryList =
    normalized
      .map((cat) => `- ${cat.main_category}: ${cat.subcategories.join(", ")}`)
      .join("\n") || "- その他: その他";

  cachedCategories = {
    data: normalized,
    categoryList,
    expiresAt: Date.now() + 60_000,
  };

  return { data: normalized, categoryList };
}

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
      fileName: file.name || `receipt-${Date.now()}`,
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

  console.log(
    `Storage画像取得: ${storagePath} (${(fileData.size / 1024 / 1024).toFixed(2)}MB)`
  );

  return {
    blob: fileData,
    mimeType: mimeType || fileData.type || "image/jpeg",
    fileName: storagePath.split("/").pop() || `receipt-${Date.now()}`,
    cleanup: async () => {
      const { error } = await supabaseAdmin.storage
        .from("receipt-images")
        .remove([storagePath]);

      if (error) {
        console.warn("Storage削除エラー:", error);
      } else {
        console.log("Storage画像削除完了:", storagePath);
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
      return NextResponse.json(
        { error: "認証に失敗しました" },
        { status: 401 }
      );
    }
    timer.mark("auth");

    const source = await resolveInputSource(request, user.id);
    sourceCleanup = source.cleanup;
    // 事前ビルド済みの categoryList を取得 (per-request 文字列構築を回避)
    const { data: catData, categoryList } = await getCachedCategories();
    timer.mark("prepare");

    // 短縮プロンプト
    // 核: totalAmount 優先 / 割引・税金・小計を item にしない / カテゴリは既定リストから / カタカナ略称は自然日本語化
    const prompt = `レシート画像を解析し JSON のみで返答。

【最優先】
- 「合計/お支払/税込合計」を totalAmount に。これが真実。
- 価格は印字のまま（税抜でも税込でも変換禁止）。items 合計と不一致OK（サーバー側で按分）。

【item に入れるな】
- 割引/値引/クーポン/%引/マイナス金額 → 直前商品の価格から差し引いた値だけ出力
- 消費税/内税/外税/小計/合計/お釣り/預かり → 一切出力禁止

【カテゴリー】次から選択（他禁止、迷ったら「その他」）:
${categoryList}

【memo】カタカナ略称・半角カナは自然な日本語に（例: ﾓﾔｼ→もやし, トリムネ→鶏むね肉）。ブランド名は維持。

【出力形式】
{"date":"YYYY-MM-DD","items":[{"categoryMain":"食費","categorySub":"食料品","storeName":"店名","amount":254,"memo":"卵"}],"totalAmount":9522}

- 1 商品 = 1 item（「野菜、肉など」のようにまとめない）
- 日付不明時は ${getJSTDateString()}`;

    // === inline 優先経路 ===
    // ≤ INLINE_LIMIT_BYTES かつ PDF 以外なら Files API (upload + polling + delete) を丸ごとスキップ
    // PDF または大きい画像は従来通り Files API 経由
    const useInline =
      source.blob.size <= INLINE_LIMIT_BYTES &&
      source.mimeType !== "application/pdf";

    let parts: Part[];
    if (useInline) {
      parts = [
        { text: prompt },
        await blobToInlinePart(source.blob, source.mimeType),
      ];
      timer.mark("upload"); // inline 化のみ (base64 変換時間)
    } else {
      const uploadedFile = await uploadGeminiFile(
        source.blob,
        source.mimeType,
        source.fileName
      );
      geminiFileName = uploadedFile.name || null;
      parts = buildPromptWithUploadedFile(prompt, uploadedFile);
      timer.mark("upload"); // Files API 経由 (upload + polling)
    }

    // モデル: gemini-2.0-flash (GA、最速、レシート OCR には十分)
    // generationConfig: responseMimeType を付けない (preview model で切断不具合経験)
    // maxOutputTokens: 8192 (長いレシート対応 + 暴走防止の保険)
    const result = await withGeminiRetry(() =>
      geminiClient.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts }],
        config: {
          temperature: 0,
          maxOutputTokens: 8192,
        },
      })
    );
    const text = result.text ?? "";
    const finishReason = result.candidates?.[0]?.finishReason;
    timer.mark("inference");

    console.log(
      "Receipt API Gemini Response length:", text.length,
      "finishReason:", finishReason,
      "head:", text.slice(0, 150),
      "tail:", text.slice(-150)
    );

    let receiptData;
    try {
      receiptData = JSON.parse(extractFirstJsonObject(text));
    } catch (parseErr) {
      console.error("[receipt] JSON parse failed. text length:", text.length, "finishReason:", result.candidates?.[0]?.finishReason, "text tail:", text.slice(-500), "err:", (parseErr as Error).message);
      throw new Error(`レシートの解析結果が不正な形式でした (finish=${result.candidates?.[0]?.finishReason || "?"}, len=${text.length})`);
    }

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
    timer.mark("postprocess");

    // クリーンアップ (Storage / Files API) はレスポンス返却後にバックグラウンドで実行
    // → ユーザーには即レスポンスを返せる
    const pendingCleanup = { sourceCleanup, geminiFileName };
    sourceCleanup = undefined;
    geminiFileName = null;
    after(async () => {
      const cleanupTimer = createTimer();
      await Promise.allSettled([
        pendingCleanup.sourceCleanup?.(),
        deleteGeminiFile(pendingCleanup.geminiFileName),
      ]);
      console.log(`[receipt] cleanup done in ${cleanupTimer.elapsed().toFixed(0)}ms`);
    });
    timer.mark("cleanup_enqueued");

    receiptData._perf = timer.toRecord();
    // Vercel logs で各ステップ ms を見えるように
    console.log("[receipt] perf:", JSON.stringify(receiptData._perf), "useInline:", useInline, "blobSize:", source.blob.size);
    return NextResponse.json(receiptData, {
      headers: { "Server-Timing": timer.toServerTiming() },
    });
  } catch (error) {
    // Vercel ログで確実に見えるように stack を含めて 1 行で出す
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error("[receipt] FAILED:", errMsg, "|", errStack?.split("\n").slice(0, 5).join(" || "));
    // エラー時は同期クリーンアップ（responseを返せないため after() 意味なし）
    await Promise.allSettled([
      sourceCleanup?.(),
      deleteGeminiFile(geminiFileName),
    ]);
    const message =
      error instanceof Error ? error.message : "レシート解析に失敗しました。";
    const status =
      message === "画像パスが必要です" || message === "画像ファイルが必要です"
        ? 400
        : message === "アクセス権限がありません"
          ? 403
          : 500;

    return NextResponse.json(
      { error: status === 500 ? "レシート解析に失敗しました。再度お試しください。" : message },
      { status }
    );
  }
}
