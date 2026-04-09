"use client";

/**
 * Phase 4-B: Dashboard サマリー円グラフの軽量置き換え。
 *
 * 元は recharts の <PieChart> を使っていたが、これ一つで
 * recharts 全体 (~380KB) を初期バンドルに引き込んでいた。
 * このコンポーネントは純粋な SVG (約 50 行) で同じ見た目を再現し、
 * recharts 依存を Dashboard の critical path から除去する。
 *
 * Analysis ページの大きい BarChart / PieChart は引き続き recharts を使う
 * （Next.js の dynamic page ルーティングで別チャンクになるので影響なし）。
 */

export interface MiniDonutSlice {
  name: string;
  value: number;
}

interface MiniDonutProps {
  data: MiniDonutSlice[];
  colors: string[];
  /** 外径 (px) */
  size?: number;
  /** 内径率 0-1 */
  innerRatio?: number;
  /** 8% 以下のスライスはラベル非表示 */
  labelThreshold?: number;
  /** 全体タップ */
  onClick?: () => void;
}

export function MiniDonut({
  data,
  colors,
  size = 128,
  innerRatio = 0.55,
  labelThreshold = 0.08,
  onClick,
}: MiniDonutProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * innerRatio;

  if (total === 0 || data.length === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} onClick={onClick}>
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={outerR - innerR} />
      </svg>
    );
  }

  // 12 時から時計回りに描画
  let cumulative = 0;

  const slices = data.map((d, i) => {
    const start = cumulative / total;
    cumulative += d.value;
    const end = cumulative / total;
    const path = describeArc(cx, cy, outerR, innerR, start, end);
    const midAngle = ((start + end) / 2) * 2 * Math.PI - Math.PI / 2;
    const labelR = (outerR + innerR) / 2;
    const lx = cx + Math.cos(midAngle) * labelR;
    const ly = cy + Math.sin(midAngle) * labelR;
    const showLabel = (d.value / total) >= labelThreshold;
    return { path, color: colors[i % colors.length], name: d.name, showLabel, lx, ly };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined }}
    >
      {slices.map((s, i) => (
        <g key={i}>
          <path d={s.path} fill={s.color} />
          {s.showLabel && (
            <text
              x={s.lx}
              y={s.ly}
              fill="white"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight="bold"
            >
              {s.name}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/**
 * 始点 start (0-1) から終点 end (0-1) までのドーナツセクタを SVG パスで返す。
 * 12 時方向を 0 として時計回り。
 */
function describeArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  start: number,
  end: number
): string {
  // 全周 1 スライスは path で表現できないので 2 つに分割
  if (end - start >= 0.999) {
    return (
      describeArc(cx, cy, outerR, innerR, 0, 0.5) +
      " " +
      describeArc(cx, cy, outerR, innerR, 0.5, 1)
    );
  }
  const a0 = start * 2 * Math.PI - Math.PI / 2;
  const a1 = end * 2 * Math.PI - Math.PI / 2;
  const largeArc = end - start > 0.5 ? 1 : 0;
  const x0o = cx + Math.cos(a0) * outerR;
  const y0o = cy + Math.sin(a0) * outerR;
  const x1o = cx + Math.cos(a1) * outerR;
  const y1o = cy + Math.sin(a1) * outerR;
  const x0i = cx + Math.cos(a0) * innerR;
  const y0i = cy + Math.sin(a0) * innerR;
  const x1i = cx + Math.cos(a1) * innerR;
  const y1i = cy + Math.sin(a1) * innerR;

  return [
    `M ${x0o} ${y0o}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x0i} ${y0i}`,
    "Z",
  ].join(" ");
}
