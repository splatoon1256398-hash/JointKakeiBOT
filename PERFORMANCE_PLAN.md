# JointKakeiBOT パフォーマンス改善 実行計画

> このファイルは**別セッションからも参照できる、自己完結した改善ロードマップ**です。
> 作業を始める前に必ず「前提確認」セクションを読み、Phase ごとに進めてください。
> 各 Phase には **着手条件 / 作業内容 / 検証方法 / 完了条件 / コミットメッセージ例** を書いています。

---

## 0. 前提・ゴール

### プロジェクト
- **JointKakeiBOT** — Next.js 15 (App Router, Turbopack) + React 19 + Supabase + Google Gemini AI の共同家計簿 PWA
- デプロイ先: Vercel (Fluid Compute, Node.js runtime)
- Supabase: Auth + DB + Storage + Realtime を使用
- AI: `@google/genai` (現状モデル `gemini-3-flash-preview`)

### 改善ゴール
1. **レシート解析を体感 2〜3 倍高速化**（最優先）
2. 起動・画面遷移のレスポンスを短縮
3. 初期バンドルを削減しモバイル LCP を改善
4. 改善のたびに **アプリ上で Before/After を可視化**（Vercel Logs だけに頼らない）

### やらないこと（今回のスコープ外）
- 機能追加（新機能提案はレビュー済みだが、Phase 7 以降の別企画とする）
- DB スキーマ変更・データマイグレーション
- デザイン刷新

---

## 1. 現状スナップショット（2026-04-10 時点）

### 技術スタック
- Next.js 15.5.14 / React 19 / TypeScript 5.7 (strict)
- Supabase JS v2.48
- `@google/genai` ^1.0.0
- recharts, react-calendar, lucide-react, Radix UI, Tailwind

### 品質ゲート
- `tsc --noEmit` → pass
- `eslint.ignoreDuringBuilds: true`（本番ビルドで lint が走らない状態）
- テストなし
- 最大 chunk: `.next/static/chunks/707.*.js = 380KB`（recharts + react-calendar 系）

### 主要ホットスポット（行数）
| ファイル | 行数 | 内容 |
|---|---|---|
| [components/add-expense-dialog.tsx](components/add-expense-dialog.tsx) | 1028 | 支出追加＋レシート解析 UI |
| [components/pages/analysis.tsx](components/pages/analysis.tsx) | 824 | 月次分析 |
| [components/add-income-dialog.tsx](components/add-income-dialog.tsx) | 710 | 収入追加＋AIスキャン |
| [components/pages/savings.tsx](components/pages/savings.tsx) | 703 | 貯金目標 |
| [components/pages/dashboard.tsx](components/pages/dashboard.tsx) | 671 | ホーム |
| [components/edit-transaction-dialog.tsx](components/edit-transaction-dialog.tsx) | 575 | 編集 |
| [contexts/app-context.tsx](contexts/app-context.tsx) | 376 | グローバル状態 |
| [app/api/receipt/route.ts](app/api/receipt/route.ts) | 372 | レシート AI 解析 |

---

## 2. 見つかった問題（Findings サマリ）

優先度高い順。詳細はレビュー本文を参照。

| ID | 問題 | 対応 Phase |
|---|---|---|
| F-1 | Gemini Files API の upload + polling + 同期削除で数秒ロス | Phase 1 |
| F-2 | レシート解析プロンプトが長大でトークンが膨らんでいる | Phase 1 |
| F-3 | 起動時 `categories`/`user_settings` のフェッチ連鎖（9 ファイル重複） | Phase 2 |
| F-4 | `recentTransactions` が `items` JSON を含み転送量大 | Phase 3 |
| F-5 | 分析ページが月切替ごとに過去 12 か月を再取得 | Phase 3 |
| F-6 | recharts / react-calendar のバンドル肥大 | Phase 4 |
| F-7 | 固定費自動反映が起動時 N+1 insert | Phase 6 |
| F-8 | `supabaseAdmin.auth.getUser(token)` で毎回 RTT | Phase 6 |
| F-9 | categories キャッシュが in-memory のみ | Phase 2 で解決 |
| F-10 | Realtime `*` で全画面 refetch | Phase 6 |
| F-11 | AppProvider の theme 計算が useMemo 外 | Phase 2 に含む |
| F-12 | `eslint.ignoreDuringBuilds: true` | Phase 6 |
| F-13 | `maxDuration` / `preferredRegion` 未設定 | Phase 1 |
| F-14 | スプラッシュの 150ms 固定待機 | Phase 2 |
| F-15 | `add-expense-dialog` 1028 行 | Phase 5 |

---

## 3. 計測の仕組み（Phase 0 で導入、全 Phase で活用）

**アプリ上で確認できる**ように二段構えで入れる。

### 3-1. サーバー側: Server-Timing ヘッダ
- Route handler で各ステップを `performance.now()` で計測
- `Server-Timing: upload;dur=123, inference;dur=456, cleanup;dur=12` としてレスポンスヘッダに乗せる
- Chrome DevTools の Network タブで自動的に可視化される（プロファイリング不要）
- さらに JSON レスポンスにも `_perf: { upload, inference, cleanup, total }` を含める

### 3-2. クライアント側: 画面上 Toast / コンソール表示
- レシート解析完了時に「解析時間 ○○ms」を 2-3 秒表示する控えめな通知
- `NEXT_PUBLIC_SHOW_PERF=1` でトグル可能（本番は OFF、開発時 ON）
- ブラウザの `console.log` にも `[perf] receipt: upload=123ms inference=456ms total=789ms` を出す
- 計測結果は後述の **`PERF_LOG.md`** に手動でも追記

### 3-3. PERF_LOG.md
- 各 Phase の Before/After の実測値をここに append
- フォーマット:
  ```
  ## 2026-04-10 Phase 1 適用後
  - レシート解析: Before 9.2s → After 3.8s
  - 試したレシート: コンビニ 1枚 / スーパー 1枚 / PDF 領収書 1枚
  - モデル: gemini-2.5-flash に変更
  ```

---

## 4. 実行計画（Phase 順）

> **絶対ルール**
> 1. **1 Phase = 1 PR（または 1 ブランチ）** に収める。混ぜない。
> 2. Phase 着手前に `git status` が clean であることを確認
> 3. Phase 完了時に **PERF_LOG.md に数字を追記** してから次へ
> 4. 何か詰まったら止まって相談（推測で進めない）
> 5. Gemini モデル切替は Phase 1 内で A/B 比較する

---

### Phase 0: 計測基盤 + Supabase 型生成（所要: 約 1 時間）

#### 着手条件
- working tree clean
- `.env.local` に Supabase / Gemini のキーがある

#### 作業内容
1. **perf ヘルパー作成** — `lib/server/perf.ts` を新規作成
   - `createTimer()` → `{ mark(label), toServerTiming(), toRecord() }`
   - `performance.now()` ベースの軽量タイマー
2. **Server-Timing 配線**（後の Phase 1 で本格利用するため雛形だけ）
3. **ブラウザ側 perf 表示** — `lib/perf-toast.ts`
   - `showPerfToast(label, ms)` — 画面右下に 2 秒出す Toast
   - `NEXT_PUBLIC_SHOW_PERF` 環境変数で制御
4. **`PERF_LOG.md` を新規作成**（空テンプレートのみ）
5. **Supabase 型生成**
   - CLI 未インストールなら導入: `npm i -D supabase`
   - ログイン: `npx supabase login`
   - プロジェクト ID を `.env.local` から確認（`NEXT_PUBLIC_SUPABASE_URL` の `https://<ID>.supabase.co`）
   - 実行: `npx supabase gen types typescript --project-id <ID> > lib/database.types.ts`
   - `lib/supabase.ts` で `createClient<Database>` に変更
   - **注意**: ログインは手動が必要なので、ユーザーに指示する
6. **計測用ベースライン取得**（Phase 1 に入る前に必ず）
   - レシート解析: 実機 iPhone で 3 枚スキャン、かかった時間をメモ
   - 起動時間: `<head>` → ダッシュボード描画完了までの目視
   - Lighthouse モバイル 1 回
   - ビルドサイズ: `npm run build` → `du -sh .next/static/chunks`

#### 検証方法
- `npm run build` が通る
- `npm run dev` で起動、何も壊れていないこと
- `lib/database.types.ts` に型が生成されていること

#### 完了条件
- [ ] `lib/server/perf.ts` 存在
- [ ] `lib/perf-toast.ts` 存在
- [ ] `lib/database.types.ts` 存在（Supabase 型）
- [ ] `PERF_LOG.md` に Phase 0 baseline が記録されている
- [ ] ビルド通過

#### コミットメッセージ
```
chore: add perf measurement scaffold and generate supabase types

- lib/server/perf.ts: Server-Timing helper
- lib/perf-toast.ts: in-app perf toast (NEXT_PUBLIC_SHOW_PERF)
- lib/database.types.ts: generated from supabase schema
- PERF_LOG.md: baseline metrics
```

---

### Phase 1: レシート API 最優先最適化（所要: 半日〜1日）

#### 狙い
**レシート解析の体感時間を 9-12s → 3-5s に短縮**

#### 着手条件
- Phase 0 完了
- 実機 iPhone で baseline を計測済み

#### 作業内容

##### 1-A. inlineData 直送経路を追加
- **[lib/server/gemini.ts](lib/server/gemini.ts)** に追加:
  ```ts
  export const INLINE_LIMIT_BYTES = 4_000_000;

  export async function blobToInlinePart(blob: Blob, mimeType: string) {
    const buf = Buffer.from(await blob.arrayBuffer());
    return { inlineData: { mimeType, data: buf.toString("base64") } };
  }
  ```
- 既存 `uploadGeminiFile` / `waitForGeminiFile` はそのまま残す（PDF・巨大ファイル用）

##### 1-B. receipt/income route を inline 優先に
- **[app/api/receipt/route.ts](app/api/receipt/route.ts)**
- **[app/api/income-scan/route.ts](app/api/income-scan/route.ts)**
- 分岐:
  ```ts
  if (source.blob.size <= INLINE_LIMIT_BYTES && source.mimeType !== 'application/pdf') {
    parts = [{ text: prompt }, await blobToInlinePart(source.blob, source.mimeType)];
  } else {
    const uploaded = await uploadGeminiFile(...);
    geminiFileName = uploaded.name;
    parts = buildPromptWithUploadedFile(prompt, uploaded);
  }
  ```

##### 1-C. generationConfig 追加
- `temperature: 0`
- `responseMimeType: 'application/json'`
- `maxOutputTokens: 2048`
- 可能なら `responseSchema` で JSON 構造を強制（カテゴリは `enum` に列挙）

##### 1-D. プロンプト短縮
- [app/api/receipt/route.ts:166-214](app/api/receipt/route.ts#L166-L214) の 50 行プロンプトを半分以下に
- 削るべきもの:
  - JSON 出力例の全文（responseSchema で代替）
  - カタカナ変換の具体例（1 行に圧縮）
  - 冗長な箇条書き
- 残すべき核:
  - totalAmount 優先ルール
  - 割引/税金/小計の除外
  - カテゴリは既定リストから選ぶ

##### 1-E. クリーンアップを非同期化
- `finally` の `Promise.allSettled` をやめる
- `import { after } from "next/server"` を使い、レスポンス返却後にバックグラウンド削除
- **フォールバック**: `after` が使えない環境なら `queueMicrotask` + `.catch` の fire-and-forget
- **重要**: `sourceCleanup`（Storage 削除）と `deleteGeminiFile` は両方 after に入れる

##### 1-F. Vercel Function 設定
- 両 route ファイル先頭に追加:
  ```ts
  export const runtime = "nodejs";
  export const maxDuration = 30;
  export const preferredRegion = ["hnd1"]; // 東京
  ```
- Supabase プロジェクトが東京以外なら適切なリージョンへ

##### 1-G. Server-Timing + _perf 配線
- `lib/server/perf.ts` の `createTimer()` を使って:
  - `upload`, `inference`, `cleanup_enqueued`, `total` を計測
- レスポンスヘッダに `Server-Timing: ...`
- レスポンス JSON に `_perf: {...}` を含める（型は `ReceiptAnalysisResult` に追加）

##### 1-H. クライアント側 perf toast
- **[components/add-expense-dialog.tsx](components/add-expense-dialog.tsx)** の `analyzeImage` 内で:
  ```ts
  if (result._perf) {
    console.log('[perf] receipt', result._perf);
    showPerfToast('レシート解析', result._perf.total);
  }
  ```

##### 1-I. モデル A/B（任意だが推奨）
- `gemini-3-flash-preview` → `gemini-2.5-flash` に切替
- 同じレシート 5 枚で精度・速度を比較
- 結果を PERF_LOG.md に記録
- 問題あれば戻す

#### 検証方法
1. **ローカル**: 実レシート 5 枚（コンビニ / スーパー / レストラン / PDF / 大きい画像）でスキャン
2. **精度チェック**: カテゴリ・金額・totalAmount が Phase 1 前と同等以上
3. **速度チェック**: DevTools Network タブで Server-Timing を確認、画面にも Toast 表示
4. **エラーケース**: 破損画像・不正 MIME・巨大ファイルでもクラッシュしない
5. **プレビューデプロイ**: Vercel プレビューで実機 iPhone テスト

#### 完了条件
- [ ] inline 直送経路が動作
- [ ] Files API 経路は PDF/大容量で引き続き動作
- [ ] Toast に解析時間が表示される
- [ ] Server-Timing ヘッダが付く
- [ ] 実機で Before 比 **40% 以上短縮**
- [ ] PERF_LOG.md に Before/After を記録

#### ロールバック
- ブランチ戻すだけで完全復元
- DB スキーマ・Storage 構造は変えないので副作用なし

#### コミットメッセージ
```
perf(receipt): inline data + async cleanup + response schema

- inline data path for ≤4MB images (skip Files API upload/polling)
- after() to run cleanup after response
- generationConfig: temperature=0, responseMimeType, maxOutputTokens
- shorter prompt using responseSchema
- Server-Timing headers + _perf in JSON
- in-app perf toast via showPerfToast
- maxDuration=30, preferredRegion=hnd1

Before: ~9s / After: ~3.5s (iPhone 13, sample receipts)
```

---

### Phase 2: AppContext 集約 + 起動時フェッチ削減（所要: 1 日）

#### 狙い
**起動後ダッシュボード到達を 200〜600ms 短縮**、画面遷移のフェッチ重複を解消

#### 着手条件
- Phase 1 完了、PERF_LOG.md 更新済み

#### 作業内容

##### 2-A. AppContext 拡張
- **[contexts/app-context.tsx](contexts/app-context.tsx)** に追加:
  - `categories: CategoryRow[]`
  - `categoriesMap: Record<string, CategoryRow>`
  - `categoryIcons: Record<string, string>`
  - `userSettings: UserSettings | null`
  - `refreshCategories()`, `refreshUserSettings()`
- 起動時 1 回だけ fetch、localStorage に stale-while-revalidate
  ```ts
  const cached = localStorage.getItem('categories-v1');
  if (cached) setCategories(JSON.parse(cached));
  supabase.from('categories').select('*').order('sort_order').then(...)
  ```

##### 2-B. 各ページから重複フェッチを削除
削除対象（計 9 ファイル）:
1. [components/pages/dashboard.tsx:95-107](components/pages/dashboard.tsx#L95-L107)
2. [components/pages/analysis.tsx:125-140](components/pages/analysis.tsx#L125-L140)
3. [components/pages/history.tsx:55-67](components/pages/history.tsx#L55-L67)
4. [components/add-expense-dialog.tsx:36-54](components/add-expense-dialog.tsx#L36-L54)
5. [components/add-income-dialog.tsx](components/add-income-dialog.tsx)（該当箇所要確認）
6. [components/edit-transaction-dialog.tsx:84](components/edit-transaction-dialog.tsx#L84)
7. [components/pages/fixed-expenses.tsx:52](components/pages/fixed-expenses.tsx#L52)
8. [components/pages/budget-settings.tsx:26](components/pages/budget-settings.tsx#L26)
9. [components/pages/home-widget-settings.tsx:95](components/pages/home-widget-settings.tsx#L95)
10. [components/pages/settings.tsx](components/pages/settings.tsx)（複数箇所）

それぞれ `useApp()` 経由で `categoriesMap` / `categoryIcons` を取得するように置換。

##### 2-C. Theme 計算を useMemo に取り込み
- [contexts/app-context.tsx:130-143](contexts/app-context.tsx#L130-L143) の primary/secondary 計算を useMemo 内に。

##### 2-D. スプラッシュ待機の削除
- [app/page.tsx:81-90](app/page.tsx#L81-L90) の 150ms setTimeout を削除
- フェードアウトは CSS transition で実現し `transitionend` で `setShowSplash(false)`

##### 2-E. 段階マージ（推奨）
- **2a**: AppContext 拡張 + dashboard だけ移行（小さく検証）
- **2b**: 残り 8-9 ファイルを同じパターンで移行

#### 検証方法
1. Network タブで起動時 `categories` fetch が **1 回だけ**
2. カテゴリ追加 → 全ページが更新される（`refreshCategories` の動作確認）
3. 画面遷移でフェッチが走らないこと
4. 見た目・機能が一切壊れていない（手動チェック: dashboard/analysis/history/savings/chat/settings/add/edit を全部開く）

#### 完了条件
- [ ] categories fetch が起動時 1 回のみ
- [ ] user_settings fetch が起動時 1 回のみ
- [ ] dashboard 初期表示が体感で速い
- [ ] PERF_LOG.md に Before/After を記録

#### コミットメッセージ（2 分割推奨）
```
perf(client): centralize categories in AppContext with swr cache (2a)
perf(client): migrate all pages to use AppContext categories (2b)
```

---

### Phase 3: Dashboard / Analysis フェッチ最適化（所要: 半日）

#### 狙い
- Dashboard の転送量削減（items カラム除外）
- Analysis の月切替を **フェッチゼロ** に

#### 作業内容

##### 3-A. Dashboard クエリのスリム化
- [components/pages/dashboard.tsx:150-158](components/pages/dashboard.tsx#L150-L158)
- `recentData` SELECT から `items` を外す
  - 展開が必要になったときだけ遅延取得（on-demand）
- `monthlyData` と `recentData` のクエリを整理し、カラム最小化

##### 3-B. Analysis の 12 か月キャッシュ
- **[contexts/app-context.tsx](contexts/app-context.tsx)** に `monthlyTransactionsCache: Record<string, Transaction[]>` を追加
- キー: `userType-YYYY-MM`
- [components/pages/analysis.tsx:109-234](components/pages/analysis.tsx#L109-L234) で月切替時は **cache hit** ならフェッチしない
- cache miss のみ差分取得

##### 3-C. refreshTrigger 2 重発火の修正
- [components/pages/analysis.tsx:236-244](components/pages/analysis.tsx#L236-L244) の 2 つの useEffect を 1 本にする
- `useRef` ガードで初回 refetch を防ぐ

##### 3-D. 固定費自動反映の bulk insert 化
- [lib/fixed-expenses.ts:76-128](lib/fixed-expenses.ts#L76-L128)
- `for` ループの単発 insert を `supabase.from('transactions').insert([...])` に置換

#### 検証方法
- 月切替で Network タブに新しいリクエストが出ないこと
- 固定費自動反映が複数件でも 1 RTT で終わること
- データ内容が一致していること（spot check）

#### コミットメッセージ
```
perf(dashboard): slim columns and single-shot fetch
perf(analysis): cache 12-month window in context
perf(fixed-expenses): batch insert instead of N+1
```

---

### Phase 4: バンドル削減（所要: 半日）

#### 狙い
**初期 JS -100〜200KB、LCP -0.5〜1s**

#### 作業内容

##### 4-A. react-calendar の動的 import
- [components/pages/history.tsx:11-12](components/pages/history.tsx#L11-L12)
- `import Calendar from 'react-calendar'` → `const Calendar = dynamic(() => import('react-calendar'), { ssr: false })`
- CSS も動的 import: `'calendar' モードに切り替えたときだけ` `import('react-calendar/dist/Calendar.css')`

##### 4-B. Dashboard サマリー円グラフの軽量化
選択肢（どちらかを Phase 4 内で検証）:
1. **Option A**: `recharts/es6/chart/PieChart` など直接パスで import（効果要確認）
2. **Option B**: 自前 SVG で円グラフを書く（30-60 行、計算は極簡単）
- Analysis ページの大きいチャートは recharts のまま残す（そこまで大きくないし複雑）

##### 4-C. lucide-react の import 確認
- `import { Icon } from 'lucide-react'` 形式になっていることを grep で確認
- `import * as Icons from 'lucide-react'` はないはずだが念のため

##### 4-D. ビルドサイズ計測
- `npm run build`
- `du -sh .next/static/chunks/*` Before/After
- 特に 707.js (380KB) の変化

#### 検証方法
- カレンダーモードが正常に開く（CSS 読み込みの遅延が見た目に影響しないか）
- 円グラフのクリック動作が変わっていない
- Lighthouse モバイルスコアが落ちていない

#### コミットメッセージ
```
perf(bundle): dynamic import react-calendar and slim pie chart
```

---

### Phase 5: Dialog 分割（所要: 半日、純粋 refactor）

#### 狙い
- [components/add-expense-dialog.tsx](components/add-expense-dialog.tsx)（1028 行）を 400 行以下に
- 動的 import 時のチャンクを軽く

#### 作業内容

##### 5-A. ファイル分割
- `components/scan/receipt-scanner.tsx` — スキャン UI + `analyzeImage` + `processSelectedFile` + `uploadToStorage`
- `components/scan/category-picker.tsx` — カテゴリピッカーモーダル
- `components/expense/expense-item-row.tsx` — 1 項目の編集 UI
- `components/add-expense-dialog.tsx` — ラッパーのみ

##### 5-B. 同じパターンで add-income / edit-transaction
- `components/scan/income-scanner.tsx`
- `components/expense/item-row` を共用

#### 検証方法
- 機能ゼロ変更の refactor なので全手動テスト:
  - 支出追加（手動入力 / カメラ / ファイル選択 / PDF / 連続スキャン）
  - 収入追加（手動 / スキャン）
  - 編集（全フィールド）

#### コミットメッセージ
```
refactor(expense): split add-expense-dialog into scanner/picker/dialog
refactor(income): same split pattern for income and edit dialogs
```

---

### Phase 6: 基盤整備（所要: 1 日〜1.5 日）

#### 6-A. ESLint 復活
- [next.config.ts:4-6](next.config.ts#L4-L6) から `eslint.ignoreDuringBuilds` を削除
- `npm run lint` で出る警告をすべて修正
- 既存コードなので量が多い可能性 → ここが一番時間かかる
- 無視すべきルールは `eslint.config.mjs` で明示的に off

#### 6-B. JWT ローカル検証
- `npm i jose`
- `lib/server/auth.ts` 新規:
  ```ts
  import { jwtVerify, createRemoteJWKSet } from 'jose';
  const JWKS = createRemoteJWKSet(new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/keys`));
  export async function verifyAccessToken(token: string) { ... }
  ```
- [app/api/receipt/route.ts](app/api/receipt/route.ts), [app/api/income-scan/route.ts](app/api/income-scan/route.ts) で `supabaseAdmin.auth.getUser(token)` → `verifyAccessToken(token)` に置換
- 既存動作と差分がないか注意深く確認

#### 6-C. 固定費を Vercel Cron に移行
- `app/api/cron/fixed-expenses/route.ts` 新規
  - すべてのユーザーをループして `processFixedExpenses` を実行
  - `CRON_SECRET` ヘッダで認証
- `vercel.json` に cron 設定:
  ```json
  { "crons": [{ "path": "/api/cron/fixed-expenses", "schedule": "0 9 * * *" }] }
  ```
- [contexts/app-context.tsx:308-321](contexts/app-context.tsx#L308-L321) のクライアント側起動処理を削除
- Cron が確実に動くようになるまで **クライアント側処理は残し、Cron とクライアントの両方が動く重複期間を 1 週間設ける**
- 問題なければクライアント側削除

#### 6-D. Realtime 最適化
- [contexts/app-context.tsx:288-306](contexts/app-context.tsx#L288-L306)
- `triggerRefresh` を直接呼ばず、自分の書き込みは除外
  - payload の `new.user_id` が自分なら skip（optimistic で反映済みのため）

#### 検証方法
- `npm run build` が lint 付きで通る
- receipt/income API が認証を弾く（壊れたトークンで 401）
- Cron がプレビュー環境でも手動発火で動く
- 他ユーザーの書き込みで自画面が更新される
- 自分の書き込みで重複更新が起きない

#### コミットメッセージ
```
chore: enable eslint during builds and fix warnings
perf(auth): local JWT verification for receipt/income APIs
feat(cron): move fixed-expenses processing to Vercel Cron
perf(realtime): filter own writes and use optimistic updates
```

---

### Phase 7: テスト追加（所要: 半日）

#### 作業内容
- `npm i -D vitest @vitest/ui`
- `package.json` に `"test": "vitest"`
- `lib/__tests__/receipt-parser.test.ts`:
  - 割引行吸収
  - totalAmount 按分（一致・不一致・ゼロ）
  - 負数ガード
  - カテゴリ補正（存在しないサブカテゴリ → デフォルト）
- `lib/__tests__/fixed-expenses.test.ts`:
  - 月末日（2 月 / 4 月 / 12 月）
  - start_date / end_date 範囲チェック
  - payment_day 未到達
- `lib/__tests__/color.test.ts`:
  - hexToHsl / hslToHex ラウンドトリップ

#### 完了条件
- [ ] `npm test` が通る
- [ ] CI 未設定なら GitHub Actions で `npm run build && npm test` を追加（別タスク）

#### コミットメッセージ
```
test: add vitest and cover receipt/fixed-expense/color logic
```

---

## 5. 進行チェックリスト

各 Phase をやり終えたらここを埋める。

- [ ] Phase 0: 計測基盤 + Supabase 型生成
- [ ] Phase 1: レシート API 最適化
- [ ] Phase 2: AppContext 集約
- [ ] Phase 3: Dashboard / Analysis 最適化
- [ ] Phase 4: バンドル削減
- [ ] Phase 5: Dialog 分割
- [ ] Phase 6: 基盤整備（ESLint / JWT / Cron / Realtime）
- [ ] Phase 7: テスト追加

---

## 6. Supabase 型生成の手順（Phase 0 で実施）

もし `supabase` CLI が入っていなければ:

```bash
# 1. インストール（devDependency）
npm i -D supabase

# 2. ログイン（ブラウザが開く）
npx supabase login

# 3. プロジェクト ID を取得
# .env.local の NEXT_PUBLIC_SUPABASE_URL から
# https://<PROJECT_ID>.supabase.co の <PROJECT_ID> 部分

# 4. 型生成
npx supabase gen types typescript --project-id <PROJECT_ID> > lib/database.types.ts

# 5. lib/supabase.ts を型付きに
# - import type { Database } from './database.types'
# - createClient<Database>(url, key)
```

---

## 7. Gemini モデル A/B テストの手順（Phase 1 内）

ユーザー許可済み (`"してもいい"`)。安全に実施するため:

1. **現行モデル `gemini-3-flash-preview` のまま Phase 1 変更を入れてデプロイ**
2. 実機で 5 枚のレシートを計測、PERF_LOG に記録
3. `gemini-2.5-flash`（GA 版）に切替、同じ 5 枚で計測
4. 比較:
   - 総時間（ms）
   - JSON パースエラー率
   - カテゴリ正答率
   - totalAmount 一致率
5. 2.5-flash が同等以上なら維持、劣るなら preview に戻す
6. 結果を PERF_LOG.md の Phase 1 セクションに記録

---

## 8. ロールバック戦略

- 各 Phase を別ブランチ / 別 commit にしておく
- 問題発覚時は `git revert <commit>` で巻き戻す
- DB 変更なし・Storage 構造不変なので reversibility は高い
- Cron 移行（Phase 6-C）のみ重複期間を設けて段階移行

---

## 9. 期待される累積効果（目安）

| 指標 | 現状 | 目標 | 方法 |
|---|---|---|---|
| レシート解析（iPhone） | ~9s | ~3.5s | Phase 1 |
| 起動→ダッシュボード描画 | ~1.5s | ~0.9s | Phase 2, 4 |
| 月切替時のフェッチ | 12 か月再取得 | キャッシュヒット | Phase 3 |
| 初期 JS チャンク合計 | ~1.5MB | ~1.2MB | Phase 4 |
| 固定費反映 | N 回 insert | 1 回 | Phase 3/6 |
| カテゴリフェッチ | 9 ファイル × n 回 | 1 回 | Phase 2 |

---

## 10. 参考ファイル（レビュー時点での主要参照点）

- レシート API: [app/api/receipt/route.ts](app/api/receipt/route.ts)
- 収入スキャン: [app/api/income-scan/route.ts](app/api/income-scan/route.ts)
- Gemini ヘルパー: [lib/server/gemini.ts](lib/server/gemini.ts)
- 画像圧縮: [lib/scan-upload.ts](lib/scan-upload.ts)
- グローバル状態: [contexts/app-context.tsx](contexts/app-context.tsx)
- ダッシュボード: [components/pages/dashboard.tsx](components/pages/dashboard.tsx)
- 分析: [components/pages/analysis.tsx](components/pages/analysis.tsx)
- 支出追加: [components/add-expense-dialog.tsx](components/add-expense-dialog.tsx)
- 履歴: [components/pages/history.tsx](components/pages/history.tsx)
- 固定費: [lib/fixed-expenses.ts](lib/fixed-expenses.ts)
- エントリ: [app/page.tsx](app/page.tsx)
- ビルド設定: [next.config.ts](next.config.ts)

---

## 11. セッション間引き継ぎ

別セッションで作業を再開するときは:

1. このファイル（`PERFORMANCE_PLAN.md`）を読む
2. `PERF_LOG.md` を読んで直近の数字を確認
3. §5 のチェックリストで現在位置を確認
4. `git log --oneline -20` で直近の Phase コミットを確認
5. 該当 Phase の「着手条件」を満たしているか確認
6. 着手
