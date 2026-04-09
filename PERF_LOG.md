# Performance Log

> PERFORMANCE_PLAN.md の各 Phase の Before/After 実測値を append するファイル。
> 新しい Phase ほど上に追加する（降順）。

---

## テンプレート

```
## YYYY-MM-DD Phase N 適用後

### 計測環境
- 端末:
- ネットワーク:
- ブランチ / コミット:

### 数値
- 項目1: Before XX → After YY
- 項目2: Before XX → After YY

### 備考
-
```

---

## 2026-04-10 Phase 0 baseline

### 計測環境
- 端末: iPhone 実機（ユーザー計測分） / macOS (ビルド計測)
- ネットワーク: TBD
- ブランチ / コミット: main（perf scaffold 導入前）
- Node: (`node -v`) / Next.js 15.5.14

### ビルド数値（`npm run build`）
- `.next/static/chunks` 合計: **1.9 MB**
- First Load JS shared by all: **103 kB**
- Home page (`/`): **181 kB** (First Load JS)
- 最大チャンク `707.02b6d101f04f3ded.js`: **380 KB** (recharts + react-calendar 想定)
- 次点チャンク `389-*.js`: 204 KB
- 共通チャンク `255-*.js`: 173 KB / `4bd1b696-*.js`: 173 KB

### 実機 / 目視数値（ユーザー計測 — 未記入）
- レシート解析 (コンビニ 1 枚): TBD
- レシート解析 (スーパー 1 枚): TBD
- レシート解析 (PDF 領収書 1 枚): TBD
- 起動 → ダッシュボード描画完了: TBD
- Lighthouse モバイル: TBD

### 備考
- ビルド baseline は perf scaffold (`lib/server/perf.ts`, `lib/perf-toast.ts`) 追加後・Supabase 型生成前の値
- 実機計測はユーザー側で取得予定。取れ次第このセクションに追記する

---
