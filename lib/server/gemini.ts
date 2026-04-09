import {
  createPartFromText,
  createPartFromUri,
  FileState,
  GoogleGenAI,
  type File as GeminiFile,
  type Part,
} from "@google/genai";

const geminiApiKey = process.env.GEMINI_API_KEY || "";

export const geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });

/**
 * Gemini に inline data として直接埋め込める最大サイズ。
 * これ以下なら Files API (upload → polling → delete) を経由せず、
 * 1 回の generateContent 呼び出しに画像を base64 で含められる。
 *
 * Google の仕様上の上限は 20MB だが、リクエストサイズ / base64 膨張 /
 * Route Handler のバッファを考慮して安全側で 4MB に設定する。
 */
export const INLINE_LIMIT_BYTES = 4_000_000;

/**
 * Blob を Gemini の inlineData Part に変換する。
 * Files API と違って upload/polling が不要なので、小さい画像ではこちらを使うと
 * 数秒単位で速くなる。
 */
export async function blobToInlinePart(
  blob: Blob,
  mimeType: string
): Promise<Part> {
  const buf = Buffer.from(await blob.arrayBuffer());
  return { inlineData: { mimeType, data: buf.toString("base64") } };
}

export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        (error.message?.includes("503") ||
          error.message?.includes("429") ||
          error.message?.includes("RESOURCE_EXHAUSTED") ||
          error.message?.includes("UNAVAILABLE") ||
          error.message?.includes("DEADLINE_EXCEEDED"));

      if (attempt < maxRetries && isRetryable) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`Gemini retry ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unreachable");
}

export async function uploadGeminiFile(
  file: Blob,
  mimeType: string,
  displayName: string
): Promise<GeminiFile> {
  const uploaded = await geminiClient.files.upload({
    file,
    config: {
      mimeType,
      displayName,
    },
  });

  return waitForGeminiFile(uploaded);
}

async function waitForGeminiFile(file: GeminiFile): Promise<GeminiFile> {
  if (!file.name) {
    throw new Error("Gemini file upload did not return a file name");
  }

  let current = file;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!current.state || current.state === FileState.ACTIVE) {
      return current;
    }

    if (current.state !== FileState.PROCESSING) {
      throw new Error(`Gemini file is not usable: ${current.state}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
    current = await geminiClient.files.get({ name: file.name });
  }

  throw new Error("Gemini file processing timed out");
}

export async function deleteGeminiFile(fileName?: string | null): Promise<void> {
  if (!fileName) return;

  try {
    await geminiClient.files.delete({ name: fileName });
  } catch (error) {
    console.warn("Gemini file cleanup failed:", error);
  }
}

export function buildPromptWithUploadedFile(prompt: string, file: GeminiFile): Part[] {
  if (!file.uri || !file.mimeType) {
    throw new Error("Gemini uploaded file is missing uri or mimeType");
  }

  return [createPartFromText(prompt), createPartFromUri(file.uri, file.mimeType)];
}

export function extractFirstJsonObject(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("JSONが見つかりませんでした");
  }

  return jsonMatch[0];
}
