import { supabase as defaultClient } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSplitRatio, PAYER_USER_TYPES } from "./transfers";
import type { Json } from "./database.types";

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
  kind: string | null;
  split_ratio: Json | null;
  bank_account_id: string | null;
}

/**
 * 固定費の自動反映処理
 * - 今月の引き落とし日が過ぎている固定費を確認
 * - まだ今月分が登録されていなければ、transactionsに追加
 *
 * @param userId 処理対象ユーザー ID
 * @param client 任意の Supabase クライアント (未指定時はクライアント側 anon を使う)
 *               cron 経由で全ユーザーを処理する場合は supabaseAdmin (service role) を渡す
 */
export async function processFixedExpenses(
  userId: string,
  client: SupabaseClient = defaultClient
): Promise<{
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
    const { data: fixedExpenses, error: fetchError } = await client
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

    const { data: existingTransactions, error: txError } = await client
      .from("transactions")
      .select("memo, user_type")
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .or("memo.like.【固定費】%,memo.like.【送金】%,memo.like.【送金受取】%");

    if (txError) {
      result.errors.push(`取引取得エラー: ${txError.message}`);
      return result;
    }

    const existingMemos = new Set(
      (existingTransactions || [])
        .filter((t) => (t.memo ?? "").startsWith("【固定費】"))
        .map((t) => t.memo),
    );
    // 送金側は user_type ごとに個別 insert するため (user_type, memo) を key にする
    const existingTransferKeys = new Set(
      (existingTransactions || [])
        .filter((t) => (t.memo ?? "").startsWith("【送金】"))
        .map((t) => `${t.user_type}::${t.memo}`),
    );
    // 送金受取は dest owner の user_type で 1 件入れるので、同じ key 形式で dedup
    const existingReceiptKeys = new Set(
      (existingTransactions || [])
        .filter((t) => (t.memo ?? "").startsWith("【送金受取】"))
        .map((t) => `${t.user_type}::${t.memo}`),
    );

    // budget_transfer の受取側 user_type 決定用に bank_accounts.owner_user_type を引く
    const transferBankIds = Array.from(
      new Set(
        (fixedExpenses as FixedExpense[])
          .filter((e) => e.kind === "budget_transfer" && e.bank_account_id)
          .map((e) => e.bank_account_id as string),
      ),
    );
    let bankOwnerById = new Map<string, string>();
    if (transferBankIds.length > 0) {
      const { data: banks, error: banksError } = await client
        .from("bank_accounts")
        .select("id, owner_user_type")
        .in("id", transferBankIds);
      if (banksError) {
        result.errors.push(`銀行口座取得エラー: ${banksError.message}`);
      } else if (banks) {
        bankOwnerById = new Map(
          (banks as Array<{ id: string; owner_user_type: string }>).map((b) => [
            b.id,
            b.owner_user_type,
          ]),
        );
      }
    }

    // Phase 3-D: 単発 insert のループを bulk insert 1 回に置換
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`;
    const rowsToInsert: Array<{
      user_id: string;
      user_type: string;
      type: "expense" | "income";
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

      // 引き落とし日の日付を生成（月末を超えないよう調整）
      const actualPayDay = Math.min(expense.payment_day, lastDayOfMonth);
      const paymentDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(actualPayDay).padStart(2, "0")}`;

      if (expense.kind === "budget_transfer") {
        // 送金: 個人家計簿に折半分 (or 設定比率) を expense として登録
        const ratio = normalizeSplitRatio(expense.split_ratio, expense.user_type);
        const destOwner = expense.bank_account_id
          ? bankOwnerById.get(expense.bank_account_id) ?? null
          : null;
        const transferMemoBase = `【送金】${expense.memo || expense.category_sub}`;
        let receiptTotal = 0;
        for (const payer of PAYER_USER_TYPES) {
          const pct = ratio[payer] ?? 0;
          if (pct <= 0) continue;
          const portion = Math.round((expense.amount * pct) / 100);
          if (portion <= 0) continue;
          // 送金先が payer 本人の口座なら、同一人物内の口座間移動なので家計簿には記録しない
          if (destOwner === payer) continue;
          const memoForPayer = `${transferMemoBase} (${payer}分)`;
          if (existingTransferKeys.has(`${payer}::${memoForPayer}`)) {
            result.skipped++;
            continue;
          }
          rowsToInsert.push({
            user_id: expense.user_id,
            user_type: payer,
            type: "expense",
            amount: portion,
            category_main: expense.category_main,
            category_sub: expense.category_sub,
            memo: memoForPayer,
            date: paymentDate,
          });
          insertedLabels.push(`送金 ${payer} ${expense.category_sub} ¥${portion}`);
          receiptTotal += portion;
        }
        // 受取側 (destOwner の家計簿) に income を 1 件登録
        // same-person 分は除外済みなので receiptTotal は実際に受取側へ流入する合計
        if (destOwner && receiptTotal > 0) {
          const receiptMemo = `【送金受取】${expense.memo || expense.category_sub}`;
          const receiptKey = `${destOwner}::${receiptMemo}`;
          if (!existingReceiptKeys.has(receiptKey)) {
            rowsToInsert.push({
              user_id: expense.user_id,
              user_type: destOwner,
              type: "income",
              amount: receiptTotal,
              category_main: expense.category_main,
              category_sub: expense.category_sub,
              memo: receiptMemo,
              date: paymentDate,
            });
            insertedLabels.push(
              `送金受取 ${destOwner} ${expense.category_sub} ¥${receiptTotal}`,
            );
          } else {
            result.skipped++;
          }
        }
        continue;
      }

      // 固定費 (expense): 既存の挙動 (全額を user_type で登録)
      const fixedExpenseMemo = `【固定費】${expense.memo || expense.category_sub}`;
      const oldFormatMemo = `【固定費】${expense.category_main}/${expense.category_sub}${expense.memo ? ` - ${expense.memo}` : ""}`;

      if (existingMemos.has(fixedExpenseMemo) || existingMemos.has(oldFormatMemo)) {
        result.skipped++;
        continue;
      }

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
      const { error: insertError } = await client
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
