// ===== 型定義のみ =====
// AI処理はすべてサーバーサイドAPIルート（/api/chat, /api/receipt）で実行
// クライアントにAPIキーは一切露出しない

/** レシート解析の1明細 */
export interface ExpenseItem {
  categoryMain: string;      // 大カテゴリー
  categorySub: string;        // 小カテゴリー
  storeName: string;          // 店名
  amount: number;             // 金額
  memo: string;               // メモ
}

/** サーバー側パフォーマンス計測レコード（ルートが返せば表示） */
export interface PerfRecord {
  upload?: number;
  inference?: number;
  cleanup_enqueued?: number;
  total: number;
  [key: string]: number | undefined;
}

/** レシート解析結果 */
export interface ReceiptAnalysisResult {
  date: string;               // 日付
  items: ExpenseItem[];       // 支出項目の配列
  totalAmount: number;        // 合計金額
  _perf?: PerfRecord;         // サーバー側計測（存在すれば UI で表示）
}

/** トランザクションに格納するitems JSONBの型 */
export interface TransactionItem {
  categoryMain: string;
  categorySub: string;
  storeName: string;
  amount: number;
  memo: string;
}
