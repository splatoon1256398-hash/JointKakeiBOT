/**
 * Supabase Storage のオブジェクトパスを検証する。
 *
 * 既存コードは `storagePath.startsWith(userId + "/")` だけで済ませていたが、
 * これだと `userA/../userB/secret.jpg` のようなパストラバーサル攻撃を素通ししてしまう。
 * Supabase 側が normalize してくれる挙動に依存するのは危険なので、API Route に入る前に
 * ここで弾く。
 */

import { AppError } from "@/lib/errors";

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * `storagePath` が `${userId}/` から始まり、`..` を含まず、各セグメントが安全な文字種だけ
 * であることを検証する。違反時は AppError("invalid_storage_path", 400) を throw。
 */
export function assertSafeUserScopedPath(
  storagePath: unknown,
  userId: string
): asserts storagePath is string {
  if (typeof storagePath !== "string" || storagePath.length === 0) {
    throw new AppError("invalid_storage_path", 400, "画像パスが必要です");
  }
  if (storagePath.length > 512) {
    throw new AppError("invalid_storage_path", 400, "画像パスが長すぎます");
  }
  if (!storagePath.startsWith(`${userId}/`)) {
    throw new AppError("forbidden", 403, "アクセス権限がありません");
  }

  const segments = storagePath.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new AppError("invalid_storage_path", 400, "不正なパスです");
    }
    if (!SAFE_SEGMENT.test(seg)) {
      throw new AppError("invalid_storage_path", 400, "不正なパスです");
    }
  }
}
