"use client";

import { useRef, useCallback } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** 発火に必要な水平移動量(px) */
  threshold?: number;
  /** 許容する垂直移動量(px)。これを超えたら縦スクロール扱いで無効 */
  maxVertical?: number;
  /** 許容する最大時間(ms)。これを超えるとゆっくりドラッグ扱いで無効 */
  timeoutMs?: number;
}

const SKIP_SELECTOR =
  '[data-no-swipe],input,textarea,select,[contenteditable="true"]';

/**
 * 画面のヨコスワイプを検出するシンプルなフック。
 * - touchstart で起点を記録、touchend で閾値を満たせば onSwipeLeft/Right を呼ぶ
 * - テキスト入力要素や [data-no-swipe] を含むツリー内では無効化
 * - 垂直移動量 > maxVertical は縦スクロール扱いで無効
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  maxVertical = 60,
  timeoutMs = 600,
}: UseSwipeOptions) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startTime = useRef<number>(0);
  const skip = useRef<boolean>(false);

  const onTouchStart = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(SKIP_SELECTOR)) {
      skip.current = true;
      return;
    }
    skip.current = false;
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
  }, []);

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      if (skip.current) {
        skip.current = false;
        return;
      }
      if (startX.current === null || startY.current === null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;
      const dt = Date.now() - startTime.current;
      startX.current = null;
      startY.current = null;
      if (dt > timeoutMs) return;
      if (Math.abs(dy) > maxVertical) return;
      if (Math.abs(dx) < threshold) return;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    [onSwipeLeft, onSwipeRight, maxVertical, threshold, timeoutMs]
  );

  return { onTouchStart, onTouchEnd };
}
