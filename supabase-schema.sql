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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_saving_goals_user_type ON saving_goals(user_type);

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
