import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/server/auth";
import { blobToInlinePart, geminiClient, withGeminiRetry } from "@/lib/server/gemini";
import { AppError, reportError, toErrorPayload } from "@/lib/errors";
import type { Part } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 30;
export const preferredRegion = ["hnd1"];

/**
 * 音声ファイルを Gemini に投げて日本語テキストに書き起こす。
 *
 * 動機:
 *   - iOS PWA の Web Speech API はマイク許可を毎回聞き直してくる (日常的に痛い)
 *   - サーバー側 STT なら navigator.mediaDevices.getUserMedia の許可は 1 度だけで持続する
 *
 * 入力: multipart/form-data の "audio" フィールド (Blob)
 * 出力: { text: string }
 */

// Gemini が受け付ける audio mimeType に正規化
// MediaRecorder は iOS/Android/Chrome で異なる mimeType を吐く
function normalizeAudioMime(raw: string): string {
  const base = raw.split(";")[0].trim().toLowerCase();
  // ブラウザ由来のもの → Gemini が受ける標準形式に寄せる
  if (base === "audio/webm" || base === "audio/webm;codecs=opus") return "audio/webm";
  if (base === "audio/ogg" || base === "audio/ogg;codecs=opus") return "audio/ogg";
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/x-m4a") return "audio/mp4";
  if (base === "audio/mpeg" || base === "audio/mp3") return "audio/mp3";
  if (base === "audio/wav" || base === "audio/x-wav") return "audio/wav";
  if (base === "audio/aac") return "audio/aac";
  if (base === "audio/flac") return "audio/flac";
  return base || "audio/webm";
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      throw new AppError("auth_required", 401, "認証が必要です");
    }

    const user = await verifyAccessToken(token);
    if (!user) {
      throw new AppError("auth_invalid", 401, "認証に失敗しました");
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AppError("invalid_content_type", 400, "multipart/form-data が必要です");
    }

    const formData = await request.formData();
    const audioEntry = formData.get("audio");
    if (!(audioEntry instanceof Blob)) {
      throw new AppError("invalid_file", 400, "音声ファイルが必要です");
    }

    // ざっくり上限: 15MB (≒ 10 分 webm opus)
    if (audioEntry.size > 15 * 1024 * 1024) {
      throw new AppError("file_too_large", 413, "音声ファイルが大きすぎます");
    }
    if (audioEntry.size === 0) {
      throw new AppError("empty_audio", 400, "音声データが空です");
    }

    const mimeType = normalizeAudioMime(
      (audioEntry as File).type || "audio/webm"
    );

    const audioPart = await blobToInlinePart(audioEntry, mimeType);

    const prompt = `次の音声を日本語に書き起こしてください。

ルール:
- 文字起こしのテキストのみを返す（前置きや説明、句点以外の装飾は一切不要）
- 句読点は自然に付与する
- 「えーと」「あのー」等のフィラーは除去
- 音声が空・雑音のみなら空文字 "" を返す`;

    const parts: Part[] = [{ text: prompt }, audioPart];

    const result = await withGeminiRetry(() =>
      geminiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
      })
    );

    const text = (result.text ?? "").trim();

    return NextResponse.json({ text });
  } catch (err) {
    reportError("stt", err);
    const { status, body } = toErrorPayload(err);
    return NextResponse.json(body, { status });
  }
}
