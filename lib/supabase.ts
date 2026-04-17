import { createClient } from '@supabase/supabase-js';
// 生成済み型は lib/database.types.ts。個別テーブル型は
//   import type { Database } from '@/lib/supabase';
//   type Category = Database['public']['Tables']['categories']['Row'];
// のように必要な箇所から参照する。
// ※ 既存コードの null 許容差分が大きいため createClient<Database> は一旦見送り、
//    Phase 6 (ESLint 復活) 時に段階的に型付けを強化する。
import type { Database as GeneratedDatabase } from './database.types';
import { clientEnv } from './env';

// Supabaseクライアント (env アクセサが欠落時に明示 throw する)
export const supabase = createClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey);

// 生成済みの完全な型を Database として公開
export type Database = GeneratedDatabase;
