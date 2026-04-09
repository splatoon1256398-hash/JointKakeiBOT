import { createClient } from '@supabase/supabase-js';
// 生成済み型は lib/database.types.ts。個別テーブル型は
//   import type { Database } from '@/lib/supabase';
//   type Category = Database['public']['Tables']['categories']['Row'];
// のように必要な箇所から参照する。
// ※ 既存コードの null 許容差分が大きいため createClient<Database> は一旦見送り、
//    Phase 6 (ESLint 復活) 時に段階的に型付けを強化する。
import type { Database as GeneratedDatabase } from './database.types';

// 環境変数からSupabaseの設定を取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabaseの環境変数が設定されていません。.env.localファイルを確認してください。'
  );
}

// Supabaseクライアント
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 生成済みの完全な型を Database として公開
export type Database = GeneratedDatabase;
