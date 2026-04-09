/**
 * アプリ内パフォーマンス可視化 Toast
 *
 * `NEXT_PUBLIC_SHOW_PERF=1` のときだけ有効。
 * 画面右下に 2 秒間、控えめなカードを表示する。
 *
 * 使い方:
 * ```ts
 * import { showPerfToast, logPerf } from "@/lib/perf-toast";
 *
 * if (result._perf) {
 *   logPerf("receipt", result._perf);
 *   showPerfToast("レシート解析", result._perf.total);
 * }
 * ```
 *
 * 外部ライブラリ依存なし。DOM を直接触る軽量実装。
 */

const CONTAINER_ID = "__perf_toast_container";
const TOAST_DURATION_MS = 2200;

type PerfRecord = Record<string, number | undefined>;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return process.env.NEXT_PUBLIC_SHOW_PERF === "1";
}

function ensureContainer(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  let container = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (container) return container;

  container = document.createElement("div");
  container.id = CONTAINER_ID;
  Object.assign(container.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(container);
  return container;
}

/**
 * 画面右下に perf 計測結果を Toast 表示する。
 * NEXT_PUBLIC_SHOW_PERF=1 のときだけ動作する。
 */
export function showPerfToast(label: string, ms: number): void {
  if (!isEnabled()) return;
  const container = ensureContainer();
  if (!container) return;

  const toast = document.createElement("div");
  Object.assign(toast.style, {
    background: "rgba(15, 23, 42, 0.92)",
    color: "#f8fafc",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
    opacity: "0",
    transform: "translateY(4px)",
    transition: "opacity 160ms ease, transform 160ms ease",
  } satisfies Partial<CSSStyleDeclaration>);
  toast.textContent = `${label}: ${formatMs(ms)}`;

  container.appendChild(toast);

  // enter
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // exit
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(4px)";
    window.setTimeout(() => toast.remove(), 200);
  }, TOAST_DURATION_MS);
}

/**
 * perf レコードを console に 1 行で出力する。
 * 本番でも軽量なので常に動作させる（フラグでガードしたいなら呼び出し側で分岐）。
 */
export function logPerf(tag: string, perf: PerfRecord): void {
  if (typeof console === "undefined") return;
  const parts = Object.entries(perf)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([k, v]) => `${k}=${formatMs(v)}`)
    .join(" ");
  console.log(`[perf] ${tag} ${parts}`);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
