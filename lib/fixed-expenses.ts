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
  start_date: string | null;
  end_date: string | null;
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
    // 月末日を動的に計算（2月=28/29, 4月=30, etc）
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;

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

    // Phase 3-D: 単発 insert のループを bulk insert 1 回に置換
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`;
    const rowsToInsert: Array<{
      user_id: string;
      user_type: string;
      type: "expense";
      amount: number;
      category_main: string;
      category_sub: string;
      memo: string;
      date: string;
    }> = [];
    const insertedLabels: string[] = [];

    for (const expense of fixedExpenses as FixedExpense[]) {
      // 適用期間チェック: start_date/end_date の範囲外ならスキップ
      if (expense.start_date && todayStr < expense.start_date) {
        result.skipped++;
        continue;
      }
      if (expense.end_date && todayStr > expense.end_date) {
        result.skipped++;
        continue;
      }

      // 引き落とし日がまだ来ていない場合はスキップ
      if (expense.payment_day > currentDay) {
        result.skipped++;
        continue;
      }

      // 固定費の識別子（メモに埋め込み、重複チェック用）
      // 新フォーマット: 【固定費】メモ内容 or 【固定費】小カテゴリー
      const fixedExpenseMemo = `【固定費】${expense.memo || expense.category_sub}`;
      // 旧フォーマットとの互換性チェック用
      const oldFormatMemo = `【固定費】${expense.category_main}/${expense.category_sub}${expense.memo ? ` - ${expense.memo}` : ""}`;

      // 今月すでに登録済みならスキップ（新旧両フォーマットに対応）
      if (existingMemos.has(fixedExpenseMemo) || existingMemos.has(oldFormatMemo)) {
        result.skipped++;
        continue;
      }

      // 引き落とし日の日付を生成（月末を超えないよう調整）
      const actualPayDay = Math.min(expense.payment_day, lastDayOfMonth);
      const paymentDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(actualPayDay).padStart(2, "0")}`;

      rowsToInsert.push({
        user_id: expense.user_id,
        user_type: expense.user_type,
        type: "expense",
        amount: expense.amount,
        category_main: expense.category_main,
        category_sub: expense.category_sub,
        memo: fixedExpenseMemo,
        date: paymentDate,
      });
      insertedLabels.push(`${expense.category_main}/${expense.category_sub} ¥${expense.amount}`);
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("transactions")
        .insert(rowsToInsert);

      if (insertError) {
        result.errors.push(`固定費 bulk 登録エラー: ${insertError.message}`);
      } else {
        result.processed = rowsToInsert.length;
        console.log(`✅ 固定費を自動登録 (bulk): ${insertedLabels.join(", ")}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`予期しないエラー: ${error}`);
    return result;
  }
}
