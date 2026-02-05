import { createClient } from '@supabase/supabase-js';

// 環境変数からSupabaseの設定を取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabaseの環境変数が設定されていません。.env.localファイルを確認してください。'
  );
}

// Supabaseクライアントを作成
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 型定義（必要に応じて拡張してください）
export type Database = {
  public: {
    Tables: {
      // ここにテーブル定義を追加
    };
  };
};
