import { supabase } from "./supabase";

interface FixedExpense {
  id: string;
  user_id: string;
  user_type: string;
  category_main: string;
  category_sub: string;
  amount: number;
  payment_day: number;
  memo: string | null;
}

/**
 * 固定費の自動反映処理
 * - 今月の引き落とし日が過ぎている固定費を確認
 * - まだ今月分が登録されていなければ、transactionsに追加
 */
export async function processFixedExpenses(userId: string): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();

    // 有効な固定費をすべて取得
    const { data: fixedExpenses, error: fetchError } = await supabase
      .from("fixed_expenses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (fetchError) {
      result.errors.push(`固定費取得エラー: ${fetchError.message}`);
      return result;
    }

    if (!fixedExpenses || fixedExpenses.length === 0) {
      return result;
    }

    // 今月の固定費取引を取得（重複チェック用）
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, "0")}-31`;

    const { data: existingTransactions, error: txError } = await supabase
      .from("transactions")
      .select("memo")
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .like("memo", "【固定費】%");

    if (txError) {
      result.errors.push(`取引取得エラー: ${txError.message}`);
      return result;
    }

    const existingMemos = new Set(existingTransactions?.map((t) => t.memo) || []);

    // 各固定費を処理
    for (const expense of fixedExpenses as FixedExpense[]) {
      // 引き落とし日がまだ来ていない場合はスキップ
      if (expense.payment_day > currentDay) {
        result.skipped++;
        continue;
      }

      // 固定費の識別子（メモに埋め込み、重複チェック用）
      const fixedExpenseMemo = `【固定費】${expense.category_main}/${expense.category_sub}${expense.memo ? ` - ${expense.memo}` : ""}`;

      // 今月すでに登録済みならスキップ
      if (existingMemos.has(fixedExpenseMemo)) {
        result.skipped++;
        continue;
      }

      // 引き落とし日の日付を生成
      const paymentDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(expense.payment_day).padStart(2, "0")}`;

      // transactionsに追加
      const { error: insertError } = await supabase.from("transactions").insert({
        user_id: expense.user_id,
        user_type: expense.user_type,
        type: "expense",
        amount: expense.amount,
        category_main: expense.category_main,
        category_sub: expense.category_sub,
        memo: fixedExpenseMemo,
        date: paymentDate,
      });

      if (insertError) {
        result.errors.push(`固定費登録エラー (${expense.category_main}): ${insertError.message}`);
      } else {
        result.processed++;
        console.log(`✅ 固定費を自動登録: ${expense.category_main}/${expense.category_sub} ¥${expense.amount}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`予期しないエラー: ${error}`);
    return result;
  }
}
