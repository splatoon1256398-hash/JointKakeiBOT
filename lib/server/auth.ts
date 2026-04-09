/**
 * Phase 6-B: Supabase JWT のローカル検証ヘルパー
 *
 * 以前は毎リクエスト `supabaseAdmin.auth.getUser(token)` で Supabase API を
 * 呼んでおり、1 API Route あたり 100-300ms の RTT が発生していた。
 *
 * Supabase (ES256 asymmetric) は `/auth/v1/.well-known/jwks.json` で JWKS を
 * 公開しているので、jose で署名検証すれば追加 RTT なしで user.id を取り出せる。
 * JWKS は jose 側でメモリキャッシュされるので実質 0 コスト。
 */

import { jwtVerify, createRemoteJWKSet } from "jose";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

// JWKS をモジュールロード時に一度だけ作成。jose 内部で TTL キャッシュされる。
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

export interface VerifiedUser {
  id: string;
  email?: string;
  role?: string;
}

/**
 * Supabase access token をローカルで検証し、user.id などを返す。
 * 検証失敗 / 期限切れ / 壊れた token の場合は null。
 *
 * 既存の `supabaseAdmin.auth.getUser(token)` の代替。
 */
export async function verifyAccessToken(
  token: string
): Promise<VerifiedUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      // Supabase access token の issuer
      issuer: `${SUPABASE_URL}/auth/v1`,
    });
    if (!payload.sub || typeof payload.sub !== "string") return null;
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
    };
  } catch (err) {
    // 期限切れ / 署名不一致 / parse エラーなど
    console.warn("[auth] verifyAccessToken failed:", (err as Error).message);
    return null;
  }
}
