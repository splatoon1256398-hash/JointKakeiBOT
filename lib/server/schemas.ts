/**
 * API Route が受け取る JSON ボディの Zod スキーマ。
 *
 * 目的:
 *   - `await request.json()` の戻りを型だけで信じず、実行時に構造を検証する。
 *   - 不正なリクエストを境界で弾いて、下流の DB 層 / Gemini 層に壊れたデータを流さない。
 *   - 失敗時は AppError("invalid_request", 400) で統一レスポンスに乗せる。
 *
 * 使い方:
 *   ```ts
 *   const body = await request.json();
 *   const parsed = parseBody(ChatRequestSchema, body);
 *   ```
 */

import { z } from "zod";
import { AppError } from "@/lib/errors";

// ===== 共通 =====

/** YYYY-MM-DD のみ許容 */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付形式が不正です");

/** Supabase Storage の path (起点は userId/). セグメントは英数._- のみ */
export const StoragePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((v) => !v.split("/").some((seg) => seg === "" || seg === "." || seg === ".."), {
    message: "不正なパスです",
  });

// ===== /api/chat =====

const ChatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  functionCalls: z
    .array(
      z.object({
        name: z.string(),
        args: z.record(z.string(), z.unknown()),
        result: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      })
    )
    .optional(),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1, "メッセージが空です").max(4000, "メッセージが長すぎます"),
  selectedUser: z.string().min(1).max(50),
  history: z.array(ChatHistoryItemSchema).max(100, "履歴が長すぎます"),
  lastRecordedId: z.string().uuid().nullable().optional(),
});

// ===== /api/receipt, /api/income-scan (JSON 経路) =====

export const StorageScanRequestSchema = z.object({
  storagePath: StoragePathSchema,
  mimeType: z.string().max(100).optional(),
});

// ===== ヘルパー =====

/**
 * Zod で body を検証し、失敗時は AppError("invalid_request", 400) を throw する。
 * route.ts 側の catch は toErrorPayload() で拾う想定。
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join(".") || "(root)";
    throw new AppError(
      "invalid_request",
      400,
      `リクエストが不正です: ${path} — ${first.message}`,
      result.error
    );
  }
  return result.data;
}
