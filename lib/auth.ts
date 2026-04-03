import { createHmac } from "crypto";

function getOAuthStateSecret(): string | null {
  return process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET || null;
}

/**
 * OAuth state に署名を付与する。
 * 形式: `userId.timestamp.signature`
 * 有効期限: 10分
 */
export function signOAuthState(userId: string): string {
  const secret = getOAuthStateSecret();
  if (!secret) {
    throw new Error("OAuth state secret is not configured");
  }

  const timestamp = Date.now().toString();
  const payload = `${userId}.${timestamp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  return `${payload}.${sig}`;
}

/**
 * 署名付き OAuth state を検証し、userId を返す。
 * 不正または期限切れなら null。
 */
export function verifyOAuthState(state: string): string | null {
  const secret = getOAuthStateSecret();
  if (!secret) return null;

  const parts = state.split(".");
  if (parts.length !== 3) return null;

  const [userId, timestamp, sig] = parts;
  const payload = `${userId}.${timestamp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);

  if (sig !== expected) return null;

  // 10分の有効期限
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > 10 * 60 * 1000) return null;

  return userId;
}

/**
 * selectedUser がこのユーザーに許可された値かを検証する。
 * 許可: "共同", 本人の displayName
 */
export function validateSelectedUser(
  selectedUser: string,
  displayName: string
): boolean {
  const normalizedSelectedUser = selectedUser.trim();
  const normalizedDisplayName = displayName.trim();

  return normalizedSelectedUser === "共同" || (
    normalizedDisplayName.length > 0 &&
    normalizedSelectedUser === normalizedDisplayName
  );
}

/**
 * Vercel Cron の認証ヘッダーを検証する。
 */
export function verifyCronSecret(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}
