# 修正指示書 - JointKakeiBOT

## プロジェクト概要
Next.js (App Router) + Supabase + Tailwind CSSのPWA家計簿アプリ。
Vercelにデプロイ済み。スマホ（iPhone Safari）での使用が主。

---

## 修正項目

### 1. レシートスキャン中アニメーションの改善
**対象ファイル:** `components/add-expense-dialog.tsx` (L562-603付近)

**現状の問題:**
- 「近未来スキャナー」風のアニメーション（スキャンライン、コーナーマーカー、回転する円、グリッド背景）がダサい
- `UPLOADING...` / `AI SCANNING...` の英語テキスト、`tracking-widest uppercase` のスタイルが過剰

**現在のコード構成:**
- `bg-black/90 backdrop-blur-xl` の全面オーバーレイ
- 背景グリッド (CSS linear-gradient)
- スキャンライン (keyframes: scanline)
- コーナーマーカー4つ (keyframes: cornerPulse)
- 中央に3重の回転/パルス円 + Sparklesアイコン
- `UPLOADING...` / `AI SCANNING...` テキスト
- 5本のパルスバー（ただし `animationName: 'none'` で実質無効）

**修正方針:**
- シンプルで品のあるアニメーションに変更
- Sparklesアイコン + シンプルなスピナー（回転する円1つ）+ テキストだけで十分
- テキストは日本語で「画像をアップロード中...」「レシートを解析中...」
- uppercase/tracking-widestは削除
- スキャンライン、コーナーマーカー、グリッド背景、パルスバーは全て削除
- 背景はダーク半透明オーバーレイだけでOK

---

### 2. 記録メニューダイアログのデザイン改善
**対象ファイル:** `components/record-menu-dialog.tsx` (全体75行)

**現状の問題:**
- 3つのグラデーションボタン（赤/緑/青）が派手すぎて統一感がない
- ボタンが大きすぎる（h-20）

**修正方針:**
- アプリのダークテーマに合う落ち着いたデザインに
- ボタンをもう少しコンパクトに（h-14〜16程度）
- グラデーションを控えめに、またはボーダー+アイコン色でカテゴリを区別
- アプリ全体のテーマカラー（purple系）との統一感を意識

---

### 3. 音声入力の修正（重要・調査が必要）
**対象ファイル:** `components/pages/chat.tsx` (L31-57: 音声入力ロジック, L220-251: UIボタン)

**現状の問題3つ:**

#### 3-a. 毎回マイク許可を求められる
- PWAとしてホーム画面に追加済みでも、アプリ起動のたびに「マイクへのアクセスを求めています」ダイアログが出る
- 一度許可したら以降は出ないようにしたい

**調査ポイント:**
- 現在のコードはWeb Speech API（`SpeechRecognition`）のみ使用。`getUserMedia` は使っていない
- iOS SafariのPWAではWeb Speech APIのパーミッションがセッションごとにリセットされる制約がある
- 対策案: マイクボタンを押した時だけ`SpeechRecognition`を初期化する（現状もそうなっているが、iOS PWAの制約の可能性があるため、根本解決できない場合はこの問題はスキップしてOK）

#### 3-b. 音声入力が動作しない
- マイクは起動判定（`isRecording = true`）になるが、実際に音声が認識されない
- `recognition.start()` は呼ばれているが、`onresult` が発火しない可能性

**調査ポイント:**
- `recognition.interimResults = false` → `true` にすると途中結果も取得可能。ただしこれが原因かは不明
- iOS Safari PWAでのWeb Speech APIの対応状況を確認（WebKitの制限で動かない可能性）
- もしWeb Speech APIがiOS PWAで動かないなら、代替手段を検討:
  - `navigator.mediaDevices.getUserMedia` + サーバーサイド音声認識（Google Speech-to-Text等）
  - またはWeb Speech APIが使えない場合はマイクボタン自体を非表示にする
- **重要:** iOSのPWA (Standalone mode) ではWeb Speech APIがサポートされていない可能性が高い。Safari単体では動くがPWAでは動かないケースがある

#### 3-c. 入力完了後もマイク起動判定が残る
- `recognition.onend` でisRecordingをfalseにしているが、正しく発火していない可能性
- 3-bが解決すればこれも解決する可能性が高い

**音声入力の現在のコード概要 (chat.tsx):**
```
L31-57: startVoiceInput()
  - window.SpeechRecognition || window.webkitSpeechRecognition
  - lang: 'ja-JP', interimResults: false, maxAlternatives: 1
  - onstart → setIsRecording(true)
  - onend → setIsRecording(false)  
  - onerror → setIsRecording(false)
  - onresult → transcript をinputに追加
  - recognition.start()
  - recognitionRef.current に保存

L232-243: マイクボタンUI
  - isRecording時: MicOffアイコン(赤、パルスアニメ)
  - 通常時: Micアイコン
```

---

## 実装時の注意事項

1. **慎重に実装すること** - 時間がかかってもOK。各修正について以下を必ず行う:
   - 修正前にコードの全体的な文脈を理解する
   - 修正後にバグがないか確認する（特にstale closure、state更新の競合など）
   - ライトモード/ダークモード両方で表示を確認
   - iOS Safari PWA特有の制約を考慮する

2. **Radix Dialog内でのfixed/absolute配置に注意** - DialogContentに`translate`が設定されているため、`fixed`がviewport基準にならない。Portal (`createPortal(... , document.body)`) + `pointer-events-auto` が必要。

3. **既存のパターンを踏襲** - アプリ全体でpurple系テーマ、dark UIが使われている。新しいデザインもこれに合わせる。

4. **pushまで行う** - 修正完了後、commitしてgit pushまで行うこと。

5. **音声入力は調査優先** - iOS PWAでWeb Speech APIが動くか確認し、動かない場合は代替策を提案するか、マイクボタンの挙動を適切にフォールバックさせる。
