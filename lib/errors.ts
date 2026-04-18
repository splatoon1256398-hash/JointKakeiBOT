/**
 * アプリ共通のエラー型。
 *
 * - `code`: 機械可読な識別子（例: `auth_required`, `invalid_file`, `db_error`）
 * - `status`: HTTP ステータス（API ルートで `NextResponse.json(...)` に渡す想定）
 * - `message`: ユーザー / ログに見せる日本語メッセージ
 * - `cause`: 元の例外（console.error 時に完全に保持される）
 *
 * サーバー API での使い方:
 * ```ts
 * if (!session) throw new AppError("auth_required", 401, "認証が必要です");
 * ```
 *
 * route.ts の catch で `toErrorResponse(err)` を呼べば統一フォーマットで返せる。
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: string,
    status: number,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

/**
 * AppError かどうかを判定する型ガード。
 * 通常の Error と区別して特別扱いしたい箇所で使う。
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * クライアント / サーバーどちらからでも呼べる統一ロガー。
 * 将来 Sentry などを差し込む際の中継点。現状は console.error のみ。
 */
export function reportError(
  context: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  if (isAppError(err)) {
    console.error(
      `[${context}] ${err.code} (${err.status}): ${err.message}`,
      err.cause ?? "",
      extra ?? "",
    );
    return;
  }
  if (err instanceof Error) {
    console.error(`[${context}] ${err.message}`, err.stack ?? "", extra ?? "");
    return;
  }
  console.error(`[${context}]`, err, extra ?? "");
}

/**
 * 任意の例外をそのまま HTTP レスポンス用の JSON に変換する。
 * AppError ならその情報を、それ以外は 500 に落として詳細はログへ。
 */
export function toErrorPayload(err: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (isAppError(err)) {
    return {
      status: err.status,
      body: { error: err.message, code: err.code },
    };
  }
  return {
    status: 500,
    body: { error: "Internal server error", code: "internal_error" },
  };
}
