-- transactions テーブルの作成
-- Supabase の SQL Editor でこのコードを実行してください

CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- ログインユーザーID
  user_type TEXT NOT NULL,           -- "共同" or ユーザー名
  type TEXT NOT NULL DEFAULT 'expense', -- "expense" or "income"
  date DATE NOT NULL,                -- 支出日/収入日
  category_main TEXT NOT NULL,       -- 大カテゴリー（食費、日用品など）
  category_sub TEXT NOT NULL,        -- 小カテゴリー（食材、外食など）
  store_name TEXT,                   -- 店名/収入源
  amount INTEGER NOT NULL,           -- 金額
  memo TEXT,                         -- メモ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- インデックスの作成（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_main ON transactions(category_main);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_type_date_created_at
  ON transactions(user_type, type, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id_date
  ON transactions(user_id, date DESC);

-- RLS (Row Level Security) の有効化
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 認証ベースのRLSポリシー
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- コメント
COMMENT ON TABLE transactions IS '家計簿の支出記録テーブル';
COMMENT ON COLUMN transactions.user_type IS 'ユーザータイプ（共同、れん、あかね）';
COMMENT ON COLUMN transactions.category_main IS '大カテゴリー';
COMMENT ON COLUMN transactions.category_sub IS '小カテゴリー';
COMMENT ON COLUMN transactions.store_name IS '店名';
COMMENT ON COLUMN transactions.amount IS '金額（円）';
COMMENT ON COLUMN transactions.memo IS 'メモ・備考';

-- ==========================================
-- categories テーブルの作成
-- ==========================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  main_category TEXT NOT NULL UNIQUE,    -- 大カテゴリー名
  icon TEXT NOT NULL DEFAULT '📦',        -- アイコン（絵文字）
  subcategories TEXT[] NOT NULL,          -- 小カテゴリーの配列
  sort_order INTEGER DEFAULT 0,           -- 表示順序
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_categories_main_category ON categories(main_category);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);

-- RLS (Row Level Security) の有効化
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- カテゴリーは全ユーザーが読み取り可能、書き込みは認証ユーザーのみ
CREATE POLICY "Anyone can read categories" ON categories
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can modify categories" ON categories
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- updated_at を自動更新するトリガー
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 初期データの挿入
INSERT INTO categories (main_category, icon, subcategories, sort_order) VALUES
  ('食費', '🍔', ARRAY['食料品', '外食', 'カフェ・間食', 'お菓子', 'その他'], 1),
  ('日用品費', '🛒', ARRAY['消耗品', '雑貨', 'レジ袋', 'その他'], 2),
  ('住居費', '🏠', ARRAY['家賃・管理費', '家具・家電', 'その他'], 3),
  ('水道・光熱費', '💡', ARRAY['電気代', 'ガス代', '水道代'], 4),
  ('通信費', '📱', ARRAY['携帯電話', 'インターネット'], 5),
  ('車両', '🚗', ARRAY['ガソリン代', '駐車場代', '自動車保険', '車検・整備', 'その他'], 6),
  ('趣味・娯楽', '🎮', ARRAY['サブスクリプション', '旅行・レジャー', '映画', 'ゲーム', '電子機器', 'その他'], 7),
  ('交際費', '🍻', ARRAY['交際費', '飲み会'], 8),
  ('医療費', '💊', ARRAY['病院', '薬', 'その他'], 9),
  ('交通費', '🚃', ARRAY['交通費', '道路料金', 'その他'], 10),
  ('美容・衣服', '👕', ARRAY['衣服', '美容院・散髪', 'その他'], 11),
  ('資金', '💰', ARRAY['銀行振り込み', '貯金・積立'], 12),
  ('その他', '📦', ARRAY['その他'], 13)
ON CONFLICT (main_category) DO NOTHING;

COMMENT ON TABLE categories IS 'カテゴリー管理テーブル';
COMMENT ON COLUMN categories.main_category IS '大カテゴリー名';
COMMENT ON COLUMN categories.icon IS 'カテゴリーアイコン（絵文字）';
COMMENT ON COLUMN categories.subcategories IS '小カテゴリーの配列';
COMMENT ON COLUMN categories.sort_order IS '表示順序';

-- ==========================================
-- saving_goals テーブルの作成（貯金目標管理）
-- ==========================================

CREATE TABLE IF NOT EXISTS saving_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- ログインユーザーID
  user_type TEXT NOT NULL,              -- "共同" or ユーザー名
  goal_name TEXT NOT NULL,              -- 目標名
  target_amount INTEGER NOT NULL,       -- 目標金額
  current_amount INTEGER DEFAULT 0,     -- 現在の貯金額
  deadline DATE,                        -- 期限
  icon TEXT DEFAULT '🎯',               -- アイコン（絵文字）
  color TEXT DEFAULT 'purple',          -- カラーテーマ
  sort_order INTEGER DEFAULT 0,         -- 表示順序
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_saving_goals_user_type ON saving_goals(user_type);
CREATE INDEX IF NOT EXISTS idx_saving_goals_sort_order ON saving_goals(sort_order);

-- RLS (Row Level Security) の有効化
ALTER TABLE saving_goals ENABLE ROW LEVEL SECURITY;

-- 認証ベースのRLSポリシー
CREATE POLICY "Users can view own saving_goals" ON saving_goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saving_goals" ON saving_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saving_goals" ON saving_goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saving_goals" ON saving_goals
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at を自動更新するトリガー
CREATE TRIGGER update_saving_goals_updated_at BEFORE UPDATE ON saving_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE saving_goals IS '貯金目標管理テーブル';
COMMENT ON COLUMN saving_goals.user_type IS 'ユーザータイプ（共同、れん、あかね）';
COMMENT ON COLUMN saving_goals.goal_name IS '目標名（例：旅行資金、結婚資金）';
COMMENT ON COLUMN saving_goals.target_amount IS '目標金額';
COMMENT ON COLUMN saving_goals.current_amount IS '現在の貯金額';
COMMENT ON COLUMN saving_goals.deadline IS '達成期限';
COMMENT ON COLUMN saving_goals.icon IS 'アイコン（絵文字）';
COMMENT ON COLUMN saving_goals.color IS 'カラーテーマ';

-- ==========================================
-- マイグレーション: transactions テーブルに type カラムを追加
-- ==========================================

-- 既存のテーブルに type カラムを追加（既に存在する場合はスキップ）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'type'
  ) THEN
    ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense';
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_user_type_target_month
  ON transactions(user_type, target_month);

COMMENT ON COLUMN transactions.type IS '種別（expense: 支出, income: 収入）';

-- ==========================================
-- budgets テーブルの作成（予算管理）
-- ==========================================

CREATE TABLE IF NOT EXISTS budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL,              -- "共同" or ユーザー名
  category_main TEXT NOT NULL,          -- 大カテゴリー名
  monthly_budget INTEGER NOT NULL,      -- 月間予算額
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_type, category_main)      -- user_typeとcategory_mainの組み合わせは一意
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_budgets_user_type ON budgets(user_type);
CREATE INDEX IF NOT EXISTS idx_budgets_category_main ON budgets(category_main);

-- RLS (Row Level Security) の有効化
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- 認証ベースのRLSポリシー
CREATE POLICY "Users can view own budgets" ON budgets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budgets" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets" ON budgets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets" ON budgets
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at を自動更新するトリガー
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE budgets IS '予算管理テーブル';
COMMENT ON COLUMN budgets.user_type IS 'ユーザータイプ（共同、れん、あかね）';
COMMENT ON COLUMN budgets.category_main IS '大カテゴリー名';
COMMENT ON COLUMN budgets.monthly_budget IS '月間予算額（円）';

-- ==========================================
-- マイグレーション: transactions テーブルに items カラムを追加
-- ==========================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'items'
  ) THEN
    ALTER TABLE transactions ADD COLUMN items JSONB;
    COMMENT ON COLUMN transactions.items IS 'レシート解析時の明細配列（JSON）。各要素: {categoryMain, categorySub, storeName, amount, memo}';
  END IF;
END $$;

-- ==========================================
-- マイグレーション: transactions テーブルに metadata カラムを追加
-- 給与明細の総支給額（gross_amount）などを保存するためのJSONBカラム
-- ==========================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE transactions ADD COLUMN metadata JSONB;
    COMMENT ON COLUMN transactions.metadata IS '追加情報（JSON）。給与: {gross_amount: 総支給額}';
  END IF;
END $$;

-- ==========================================
-- マイグレーション: transactions テーブルに target_month カラムを追加
-- 収入の「予算対象月」を管理（例: 1月25日の給与 → 2月の予算として扱う）
-- ==========================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'target_month'
  ) THEN
    ALTER TABLE transactions ADD COLUMN target_month DATE;
    COMMENT ON COLUMN transactions.target_month IS '予算対象月（収入がどの月の予算に充てられるか）。NULLの場合はdateと同月扱い';
  END IF;
END $$;

-- ==========================================
-- マイグレーション: 共同モード RLS 修正
-- user_type='共同' のデータは認証済みユーザー全員が読み書き可能にする
-- ==========================================

-- transactions: 既存ポリシーを削除して再作成
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON transactions;

CREATE POLICY "Users can view own or joint transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id OR user_type = '共同');

CREATE POLICY "Users can insert own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own or joint transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id OR user_type = '共同');

CREATE POLICY "Users can delete own or joint transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id OR user_type = '共同');

-- saving_goals: 既存ポリシーを削除して再作成
DROP POLICY IF EXISTS "Users can view own saving_goals" ON saving_goals;
DROP POLICY IF EXISTS "Users can insert own saving_goals" ON saving_goals;
DROP POLICY IF EXISTS "Users can update own saving_goals" ON saving_goals;
DROP POLICY IF EXISTS "Users can delete own saving_goals" ON saving_goals;

CREATE POLICY "Users can view own or joint saving_goals" ON saving_goals
  FOR SELECT USING (auth.uid() = user_id OR user_type = '共同');

CREATE POLICY "Users can insert own saving_goals" ON saving_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own or joint saving_goals" ON saving_goals
  FOR UPDATE USING (auth.uid() = user_id OR user_type = '共同');

CREATE POLICY "Users can delete own or joint saving_goals" ON saving_goals
  FOR DELETE USING (auth.uid() = user_id OR user_type = '共同');

-- budgets: 既存ポリシーを削除して再作成
DROP POLICY IF EXISTS "Users can view own budgets" ON budgets;
DROP POLICY IF EXISTS "Users can insert own budgets" ON budgets;
DROP POLICY IF EXISTS "Users can update own budgets" ON budgets;
DROP POLICY IF EXISTS "Users can delete own budgets" ON budgets;

CREATE POLICY "Users can view own or joint budgets" ON budgets
  FOR SELECT USING (auth.uid() = user_id OR user_type = '共同');

CREATE POLICY "Users can insert own budgets" ON budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own or joint budgets" ON budgets
  FOR UPDATE USING (auth.uid() = user_id OR user_type = '共同');

CREATE POLICY "Users can delete own or joint budgets" ON budgets
  FOR DELETE USING (auth.uid() = user_id OR user_type = '共同');

-- ==========================================
-- マイグレーション: user_settings に joint_theme_color カラムを追加
-- 共同モードのテーマカラーを個人設定と分離して管理
-- ==========================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_settings' AND column_name = 'joint_theme_color'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN joint_theme_color TEXT;
    COMMENT ON COLUMN user_settings.joint_theme_color IS '共同モード用テーマカラー（HEX）。個人テーマとは独立';
  END IF;
END $$;

-- ==========================================
-- マイグレーション: transactions テーブルに income_month カラムを追加
-- 統計・年収計算用の「本来の支給月」（例: 1月度給与）
-- target_month が予算計算用、income_month が統計・年収集計用
-- ==========================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'income_month'
  ) THEN
    ALTER TABLE transactions ADD COLUMN income_month DATE;
    COMMENT ON COLUMN transactions.income_month IS '統計用の支給月（何月度の収入か）。年収・月別推移統計に使用。NULLの場合はdateと同月扱い';
  END IF;
END $$;

-- マイグレーション: user_settings に notification_preferences カラムを追加
-- ユーザーごとの通知種別ON/OFF設定
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_settings' AND column_name = 'notification_preferences'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN notification_preferences JSONB DEFAULT '{"budget_alert": true, "joint_expense_alert": true}'::jsonb;
    COMMENT ON COLUMN user_settings.notification_preferences IS '通知種別のON/OFF設定。budget_alert: 予算アラート, joint_expense_alert: 共同支出通知';
  END IF;
END $$;

-- マイグレーション: budget_alert_logs テーブルを作成
-- 月×カテゴリ単位で予算アラートの重複送信を防止
CREATE TABLE IF NOT EXISTS budget_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL,
  category_main TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- '80' or '100'
  alert_month TEXT NOT NULL, -- 'YYYY-MM' format
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, user_type, category_main, alert_type, alert_month)
);

CREATE INDEX IF NOT EXISTS idx_budget_alert_logs_user_month
  ON budget_alert_logs(user_id, user_type, alert_month);

ALTER TABLE budget_alert_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own alert logs" ON budget_alert_logs
  FOR ALL USING (auth.uid() = user_id);

-- マイグレーション: fixed_expenses テーブルに start_date, end_date カラムを追加
-- 適用期間を管理し、期間外の固定費は自動登録をスキップする
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_expenses' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE fixed_expenses ADD COLUMN start_date DATE;
    ALTER TABLE fixed_expenses ADD COLUMN end_date DATE;
    COMMENT ON COLUMN fixed_expenses.start_date IS '固定費の適用開始日。NULLの場合は制限なし';
    COMMENT ON COLUMN fixed_expenses.end_date IS '固定費の適用終了日。NULLの場合は無期限';
  END IF;
END $$;

-- マイグレーション: transactions テーブルに source カラムを追加
-- 登録元の識別（manual / gmail_webhook / gmail_pubsub:xxx）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'source'
  ) THEN
    ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'manual';
    COMMENT ON COLUMN transactions.source IS '登録元: manual / gmail_webhook / gmail_pubsub:{messageId} / chat';
  END IF;
END $$;

-- マイグレーション: Gmail Pub/Sub 重複処理防止テーブル
-- UNIQUE 制約で原子的なロックを実現
CREATE TABLE IF NOT EXISTS gmail_processed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

ALTER TABLE gmail_processed_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own processed messages" ON gmail_processed_messages
  FOR ALL USING (auth.uid() = user_id);

-- マイグレーション: saving_goals テーブルに sort_order カラムを追加
-- コードが既に使用しているため既存DBに対して追加が必要
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saving_goals' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE saving_goals ADD COLUMN sort_order INTEGER DEFAULT 0;
    COMMENT ON COLUMN saving_goals.sort_order IS '表示順序';
  END IF;
END $$;

-- マイグレーション: user_settings に gmail_history_id カラムを追加
-- Gmail Pub/Sub の増分同期に使用する historyId を保存
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'gmail_history_id'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN gmail_history_id TEXT;
    COMMENT ON COLUMN user_settings.gmail_history_id IS 'Gmail 増分同期用の historyId。Pub/Sub 通知で更新される';
  END IF;
END $$;

-- マイグレーション: user_settings に gmail_auto_processing カラムを追加
-- Gmail の自動処理ON/OFFをユーザーごとに管理
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'gmail_auto_processing'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN gmail_auto_processing BOOLEAN DEFAULT true;
    COMMENT ON COLUMN user_settings.gmail_auto_processing IS 'Gmail 自動処理の有効/無効フラグ';
  END IF;
END $$;

-- ==========================================
-- マイグレーション: user_settings に character_id カラムを追加
-- キャラクター着せ替え機能のID保存用
-- ==========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'character_id'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN character_id TEXT DEFAULT 'none';
    COMMENT ON COLUMN user_settings.character_id IS 'キャラ着せ替えID。none=通常、hachiware=ハチワレ';
  END IF;
END $$;

-- ==========================================
-- Stage 6 (2026-04-17): 新機能用テーブル
--   #1 レシート自動分類の学習機能
--   #7 月次 AI レポート
-- ==========================================

-- ----- #1 category_corrections -----
-- ユーザがカテゴリを手動修正した履歴を残し、AI 推論時に few-shot として参照する。
CREATE TABLE IF NOT EXISTS category_corrections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL,                       -- 共同 / れん / あかね
  store_name TEXT,                               -- 店名（無くてもよい）
  memo TEXT,                                     -- 商品・品目メモ
  original_category_main TEXT,                   -- 修正前（AI が最初に付けた値）
  original_category_sub TEXT,
  corrected_category_main TEXT NOT NULL,         -- 修正後（ユーザが確定させた値）
  corrected_category_sub TEXT NOT NULL,
  source TEXT DEFAULT 'edit_dialog',             -- 記録元 (edit_dialog / chat など)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_category_corrections_user_created
  ON category_corrections (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_corrections_user_store
  ON category_corrections (user_id, store_name);

ALTER TABLE category_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own category_corrections" ON category_corrections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own category_corrections" ON category_corrections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own category_corrections" ON category_corrections
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE category_corrections IS 'カテゴリ自動分類学習 (#1): ユーザが修正したカテゴリを few-shot 用に蓄積する';
COMMENT ON COLUMN category_corrections.source IS '記録元。edit_dialog / chat / scan など';

-- ----- #7 monthly_reports -----
-- 毎月1日 9:00 JST に生成される月次 AI レポートの保存先。
CREATE TABLE IF NOT EXISTS monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL,                       -- 共同 / れん / あかね
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,                        -- 1-12
  summary_text TEXT NOT NULL,                    -- AI 生成の要約本文
  total_expense INTEGER NOT NULL DEFAULT 0,
  total_income INTEGER NOT NULL DEFAULT 0,
  top_categories JSONB,                          -- [{main, amount}, ...]
  prev_comparison JSONB,                         -- {prev_total, diff_pct}
  read_at TIMESTAMP WITH TIME ZONE,              -- ユーザが UI 上で開封した時刻
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (user_id, user_type, year, month)       -- 同一ユーザ・区分の同月レポートは 1 件のみ
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_user_created
  ON monthly_reports (user_id, created_at DESC);

ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own monthly_reports" ON monthly_reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own monthly_reports" ON monthly_reports
  FOR UPDATE USING (auth.uid() = user_id);

-- NOTE: INSERT はサーバ側 (service role) からの cron 経由でしか発生しないため、
--       通常のユーザ insert ポリシーは置かない。

COMMENT ON TABLE monthly_reports IS '月次 AI レポート (#7): cron で自動生成しユーザに Push + チャットバナー通知する';
COMMENT ON COLUMN monthly_reports.read_at IS 'ユーザが UI で確認した時刻。NULL なら未読バッジ表示対象';

-- ==========================================
-- Stage 7 (2026-04-20): 銀行口座マスター + 固定費引落口座紐付け + 月次振込サマリー
-- ==========================================

-- 1. bank_accounts: 銀行口座マスター
-- 所有者は "れん" / "あかね" / "共同" の3種。支払元として固定費に紐付ける
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_user_type TEXT NOT NULL CHECK (owner_user_type IN ('れん', 'あかね', '共同')),
  account_name TEXT NOT NULL,
  bank_name TEXT,
  branch_name TEXT,
  account_last4 TEXT,
  color TEXT DEFAULT '#4f46e5',
  icon TEXT DEFAULT '🏦',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_owner ON bank_accounts(owner_user_type);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(is_active);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Authenticated can read bank_accounts') THEN
    CREATE POLICY "Authenticated can read bank_accounts" ON bank_accounts
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Authenticated can insert bank_accounts') THEN
    CREATE POLICY "Authenticated can insert bank_accounts" ON bank_accounts
      FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Authenticated can update bank_accounts') THEN
    CREATE POLICY "Authenticated can update bank_accounts" ON bank_accounts
      FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Authenticated can delete bank_accounts') THEN
    CREATE POLICY "Authenticated can delete bank_accounts" ON bank_accounts
      FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bank_accounts_updated_at') THEN
    CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE bank_accounts IS '銀行口座マスター (Stage 7)。固定費の引落先として紐付け、振込サマリーの基準になる';
COMMENT ON COLUMN bank_accounts.owner_user_type IS '所有者 user_type: "れん" / "あかね" / "共同"';

-- 2. fixed_expenses 拡張: 引落口座 + 負担配分
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_expenses' AND column_name = 'bank_account_id'
  ) THEN
    ALTER TABLE fixed_expenses
      ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
      ADD COLUMN split_ratio JSONB,
      ADD COLUMN transfer_required BOOLEAN DEFAULT TRUE;

    COMMENT ON COLUMN fixed_expenses.bank_account_id IS '引落口座 (bank_accounts.id)。NULL は未設定';
    COMMENT ON COLUMN fixed_expenses.split_ratio IS '負担配分 JSONB。例: {"れん":50,"あかね":50} / {"あかね":100}。NULL=user_type当人100% (共同なら50:50)';
    COMMENT ON COLUMN fixed_expenses.transfer_required IS '振込対象に含めるか。false にすると振込サマリーから除外';
  END IF;
END $$;

-- 2b. fixed_expenses: kind カラム (expense / budget_transfer)
-- expense = 通常の固定費。cron で transactions に自動登録される
-- budget_transfer = 予算送金 (食費等)。振込サマリーには出るが transactions には登録しない
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_expenses' AND column_name = 'kind'
  ) THEN
    ALTER TABLE fixed_expenses
      ADD COLUMN kind TEXT DEFAULT 'expense' CHECK (kind IN ('expense', 'budget_transfer'));

    COMMENT ON COLUMN fixed_expenses.kind IS '種別: expense (固定費、家計簿に自動登録) / budget_transfer (予算送金、家計簿には登録しない)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_bank_account
  ON fixed_expenses(bank_account_id);

-- 3. fixed_expense_transfers: 月次振込済みチェック
CREATE TABLE IF NOT EXISTS fixed_expense_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fixed_expense_id UUID NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
  target_month DATE NOT NULL,
  payer_user_type TEXT NOT NULL CHECK (payer_user_type IN ('れん', 'あかね')),
  amount INTEGER NOT NULL,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(fixed_expense_id, target_month, payer_user_type)
);

CREATE INDEX IF NOT EXISTS idx_fixed_expense_transfers_month
  ON fixed_expense_transfers(target_month, payer_user_type);

ALTER TABLE fixed_expense_transfers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fixed_expense_transfers' AND policyname = 'Authenticated can manage transfers') THEN
    CREATE POLICY "Authenticated can manage transfers" ON fixed_expense_transfers
      FOR ALL USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_fixed_expense_transfers_updated_at') THEN
    CREATE TRIGGER update_fixed_expense_transfers_updated_at
      BEFORE UPDATE ON fixed_expense_transfers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE fixed_expense_transfers IS '月次振込済みチェック (Stage 7)。月×固定費×振込者でユニーク。toggle は insert/delete で実装。amount はスナップショット';
