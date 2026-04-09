/**
 * 軽量パフォーマンス計測ユーティリティ
 *
 * Route Handler で各処理ステップの所要時間を計測し、
 * - Server-Timing ヘッダ（ブラウザ DevTools の Network タブで自動可視化）
 * - JSON レスポンスの `_perf` フィールド（アプリ内 Toast で表示）
 * の両方に出力できるようにする。
 *
 * 使い方:
 * ```ts
 * const timer = createTimer();
 * // ... upload ...
 * timer.mark("upload");
 * // ... inference ...
 * timer.mark("inference");
 *
 * return new Response(JSON.stringify({ ...data, _perf: timer.toRecord() }), {
 *   headers: { "Server-Timing": timer.toServerTiming() },
 * });
 * ```
 */

export type PerfRecord = Record<string, number> & { total: number };

export interface PerfTimer {
  /** 直前の mark (または start) からの経過時間を label に記録 */
  mark(label: string): number;
  /** label をキーに任意の値（ms）をセット */
  set(label: string, ms: number): void;
  /** Server-Timing ヘッダ形式の文字列を返す */
  toServerTiming(): string;
  /** JSON レスポンス用のレコード（total を必ず含む） */
  toRecord(): PerfRecord;
  /** 計測開始からの経過時間 (ms) */
  elapsed(): number;
}

export function createTimer(): PerfTimer {
  const start = performance.now();
  let last = start;
  const marks: Record<string, number> = {};

  return {
    mark(label: string) {
      const now = performance.now();
      const delta = now - last;
      marks[label] = Math.round(delta * 100) / 100;
      last = now;
      return marks[label];
    },
    set(label: string, ms: number) {
      marks[label] = Math.round(ms * 100) / 100;
    },
    toServerTiming() {
      const parts = Object.entries(marks).map(
        ([label, dur]) => `${sanitizeLabel(label)};dur=${dur}`
      );
      const total = performance.now() - start;
      parts.push(`total;dur=${Math.round(total * 100) / 100}`);
      return parts.join(", ");
    },
    toRecord(): PerfRecord {
      const total = Math.round((performance.now() - start) * 100) / 100;
      return { ...marks, total };
    },
    elapsed() {
      return performance.now() - start;
    },
  };
}

/** Server-Timing のラベルとして安全な文字列に変換 (空白・カンマ・セミコロン除去) */
function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, "_");
}
