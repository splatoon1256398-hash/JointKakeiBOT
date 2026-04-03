/**
 * JST日付ユーティリティ
 * toISOString().split("T")[0] はUTC基準で深夜にずれるため、
 * 必ずこのモジュールの関数を使う。
 */

/** 現在のJST日付文字列 "YYYY-MM-DD" */
export function getJSTDateString(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

/** 今月の開始日・終了日（JST基準） */
export function getJSTMonthRange(date: Date = new Date()): { start: string; end: string } {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return {
    start: `${firstDay.getUTCFullYear()}-${String(firstDay.getUTCMonth() + 1).padStart(2, "0")}-01`,
    end: `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}-${String(lastDay.getUTCDate()).padStart(2, "0")}`,
  };
}

/** 前月の開始日・終了日（JST基準） */
export function getJSTPrevMonthRange(date: Date = new Date()): { start: string; end: string } {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const prevMonth = new Date(Date.UTC(year, month - 1, 1));
  const prevMonthEnd = new Date(Date.UTC(year, month, 0));
  return {
    start: `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}-01`,
    end: `${prevMonthEnd.getUTCFullYear()}-${String(prevMonthEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(prevMonthEnd.getUTCDate()).padStart(2, "0")}`,
  };
}
