import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // 本番 tsconfig の `@/*` エイリアスを vitest 側でも解決できるようにする
      "@": root,
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/__tests__/**/*.test.ts"],
    env: {
      // supabase/env が import 時に要求する必須 env をダミー値で満たす
      // 実際に Supabase を呼ぶテストは fixed-expenses のようにモックで置換する
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
