# Performance Log

> PERFORMANCE_PLAN.md の各 Phase の Before/After 実測値を append するファイル。
> 新しい Phase ほど上に追加する（降順）。

---

## 2026-04-10 全 Phase 実装完了 (verification 保留)

> ユーザー指示: 「絶対ルールはスルーして、全部実装後に全て確認」
> → Phase 毎の実機計測は省略し、一気通貫で実装。verify は後日まとめて。

### 実装済み
- **Phase 0** 計測基盤 (lib/server/perf.ts, lib/perf-toast.ts, PERF_LOG.md, supabase 型生成)
- **Phase 1** レシート API 最適化 (inline data 直送, after() cleanup, generationConfig, プロンプト短縮, Server-Timing)
- **Phase 2** AppContext 集約 (categories/categoriesMap/categoryIcons/getCategoryIcon/getSubcategories/refreshCategories, 9 ファイルの重複 fetch 削除, theme useMemo, splash 150ms 削除)
- **Phase 3** Dashboard/Analysis 最適化 (recentData limit 20→10, analysis 月キャッシュ, refreshTrigger 2 重発火修正, 固定費 bulk insert)
- **Phase 4** バンドル削減 (react-calendar 動的 import + CSS lazy, MiniDonut SVG で Dashboard から recharts 除去)
- **Phase 6** 基盤整備 (JWT ローカル検証 via jose/JWKS, Realtime 方針確認)
- **Phase 7** vitest セットアップ + perf.test.ts (3 件 pass)

### 部分 / 後回し
- **Phase 3-A** `items` の true lazy-loading (ExpenseCard の items count 依存により UX 劣化リスク、limit 削減のみ実施)
- **Phase 5** Dialog 分割 (純粋 refactor、verify 後の別 PR 推奨)
- **Phase 6-A** ESLint 復活 (既存コードに多量の型/lint 問題の可能性、verify 後推奨)
- **Phase 6-C** Vercel Cron 移行 (本番インフラ影響、1 週間の重複期間が必要、verify 後推奨)
- **Phase 6-D** Realtime 自己書き込み除外 (multi-device 同期を壊すため元に戻した。正しい重複除去は optimistic id Set が必要)
- **Phase 7** receipt-parser / fixed-expenses / color のテスト (既存コードからの function extraction が必要、refactor リスク)

### ビルド数値 (最終)
- `.next/static/chunks` 合計: **1.9 MB** (baseline と同値 — 全体量は変化なし)
- First Load JS shared by all: **103 kB**
- Home page (`/`): **182 kB** (baseline +1kB, perf toast 等の計測基盤分)
- 最大チャンク: **406 KB** (名称は 234.*.js に変更、内容は recharts + react-calendar → recharts 主体に)
- Dashboard の recharts 依存: **除去** (自前 SVG MiniDonut に置き換え)
- 初回ルートは react-calendar も recharts も dynamic chunk 側に隔離済み

### レシート解析速度 (ユーザー実測待ち)
- Before: **約 10 秒** (ユーザー提供、gemini-3-flash-preview + Files API)
- After: **要実機検証**
  - 期待値: 3-5 秒 (inline data 経路使用時、4MB 以下の画像)
  - PDF / 4MB 超画像は Files API 経由のため Before と同等

### 検証手順 (実機 iPhone、`NEXT_PUBLIC_SHOW_PERF=1` 設定済み)
1. `npm run dev` 再起動 (環境変数反映)
2. 支出追加ダイアログからレシートスキャン × 3-5 枚
3. 画面右下 Toast の `レシート解析: X.XXs` を記録
4. Safari Web Inspector → Network タブで `Server-Timing` ヘッダ確認
5. コンソールに `[perf] receipt upload=X inference=Y total=Z` が出る
6. ダッシュボード / 分析 / 履歴 / 支出追加 / 収入追加 / 編集 を一巡して UX 崩れないか確認
7. 分析で月切替 → 2 回目以降フェッチ走らず即切替
8. 設定 → カテゴリ追加 → 他ページで反映確認

### 既知の不足 / 次 PR 候補
- ESLint 復活 (型エラー / warning 整理)
- Dialog 分割 refactor (1028 行 → 400 行)
- Cron 移行 (クライアント側 processFixedExpenses → Vercel Cron)
- Realtime 自己書き込み除外の正しい実装 (optimistic id Set)
- より多くの unit test (receipt parser, fixed-expenses, color)

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

### 実機 / 目視数値（ユーザー計測）
- レシート解析: **約 10 秒**（ユーザー実機、複数枚の体感値）
- 起動 → ダッシュボード描画完了: TBD（任意）
- Lighthouse モバイル: TBD（任意）

### 備考
- ビルド baseline は perf scaffold (`lib/server/perf.ts`, `lib/perf-toast.ts`) 追加後の値
- Supabase 型は `lib/database.types.ts` に生成済み。`createClient<Database>` ジェネリック化は既存コードの null 互換問題のため Phase 0 では見送り、型定義ファイルのみ用意した（必要な場合は `Database['public']['Tables']['xxx']['Row']` で個別 import 可）
- レシート解析 10 秒が Phase 1 の Before 値。Phase 1 目標は 3〜5 秒

---
