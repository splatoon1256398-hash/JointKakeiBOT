/**
 * 型付き環境変数アクセサ。
 *
 * 動機: コードベース中に `process.env.X!` / `process.env.X || ""` が散在していて、
 *   - 欠落時にどこで落ちるか分からない
 *   - クライアント/サーバーどちらで参照可能か名前規則だけが頼り
 *   - 値が undefined のまま空文字として Supabase/Google API に渡って無言で失敗することがある
 *
 * ここでは `required(name)` / `optional(name)` のヘルパーを提供し、
 * 用途別の名前付きアクセサから使う。required は初回アクセス時に throw するので、
 * モジュールロード時に一斉に落ちないぶん安全。
 *
 * NEXT_PUBLIC_ 接頭辞の変数はクライアントバンドルに埋め込まれるため
 * `clientEnv` 名前空間に分離している。
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/**
 * サーバー側でのみ参照可能な環境変数。
 * クライアントコンポーネントから呼ぶと undefined が返ってくる (Next.js によって置換されない)。
 */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get geminiApiKey() {
    return required("GEMINI_API_KEY");
  },
  get internalApiSecret() {
    return optional("INTERNAL_API_SECRET");
  },
  get oauthStateSecret() {
    // 後方互換: 昔は INTERNAL_API_SECRET を兼用していた
    return optional("OAUTH_STATE_SECRET") ?? optional("INTERNAL_API_SECRET");
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get googleClientId() {
    return optional("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return optional("GOOGLE_CLIENT_SECRET");
  },
  get googlePubsubTopic() {
    return optional("GOOGLE_PUBSUB_TOPIC");
  },
  get pubsubToken() {
    return optional("PUBSUB_TOKEN");
  },
  get vapidPrivateKey() {
    return optional("VAPID_PRIVATE_KEY");
  },
} as const;

/**
 * サーバー/クライアント両方で参照可能な NEXT_PUBLIC_ 系。
 * 値はビルド時にクライアントバンドルへインライン埋め込みされる。
 */
export const clientEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get vapidPublicKey() {
    return optional("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  },
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL");
  },
  get showPerf() {
    return process.env.NEXT_PUBLIC_SHOW_PERF === "1";
  },
} as const;
