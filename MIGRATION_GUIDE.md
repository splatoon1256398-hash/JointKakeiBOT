# データベースマイグレーションガイド

## 必須: Supabase SQL Editorで実行

以下のSQL文をSupabaseのSQL Editorで実行してください：

### 1. transactions テーブルに type カラムを追加

```sql
-- transactions テーブルに type カラムを追加
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'expense';

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- コメントを追加
COMMENT ON COLUMN transactions.type IS '種別（expense: 支出, income: 収入）';
```

これにより、既存のデータに影響を与えずに新しいカラムが追加されます。すべての既存レコードは自動的に `type = 'expense'` として設定されます。

### 2. budgets テーブルを作成

```sql
-- budgets テーブルの作成（予算管理）
CREATE TABLE IF NOT EXISTS budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL,
  category_main TEXT NOT NULL,
  monthly_budget INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_type, category_main)
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_budgets_user_type ON budgets(user_type);
CREATE INDEX IF NOT EXISTS idx_budgets_category_main ON budgets(category_main);

-- RLS (Row Level Security) の有効化
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- 全員が読み書きできるポリシー（開発用）
CREATE POLICY "Enable all access for all users on budgets" ON budgets
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- updated_at を自動更新するトリガー
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE budgets IS '予算管理テーブル';
COMMENT ON COLUMN budgets.user_type IS 'ユーザータイプ（共同、れん、あかね）';
COMMENT ON COLUMN budgets.category_main IS '大カテゴリー名';
COMMENT ON COLUMN budgets.monthly_budget IS '月間予算額（円）';
```

## 確認方法

```sql
-- transactions テーブル構造を確認
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'transactions';

-- budgets テーブル構造を確認
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'budgets';

-- 既存データを確認
SELECT id, user_type, type, date, amount 
FROM transactions 
LIMIT 10;
```
