import { describe, it, expect } from "vitest";
import { getJSTDateString, getJSTMonthRange, getJSTPrevMonthRange } from "./date";

/**
 * JST (UTC+9) 依存のユーティリティ。
 * UTC 基準の日付変換と混線しやすい領域なので、日付境界を含めてカバーする。
 */
describe("getJSTDateString", () => {
  it("returns YYYY-MM-DD in JST for a mid-day UTC instant", () => {
    const d = new Date("2026-04-17T03:00:00Z"); // JST 12:00
    expect(getJSTDateString(d)).toBe("2026-04-17");
  });

  it("rolls over at UTC 15:00 (JST 00:00)", () => {
    const beforeMidnightJST = new Date("2026-04-17T14:59:59Z"); // JST 23:59:59
    const afterMidnightJST = new Date("2026-04-17T15:00:00Z");  // JST 24:00 → 翌日
    expect(getJSTDateString(beforeMidnightJST)).toBe("2026-04-17");
    expect(getJSTDateString(afterMidnightJST)).toBe("2026-04-18");
  });

  it("pads single-digit month and day with leading zero", () => {
    const d = new Date("2026-01-02T03:00:00Z");
    expect(getJSTDateString(d)).toBe("2026-01-02");
  });
});

describe("getJSTMonthRange", () => {
  it("returns first and last day of the current JST month", () => {
    const d = new Date("2026-04-17T03:00:00Z");
    expect(getJSTMonthRange(d)).toEqual({ start: "2026-04-01", end: "2026-04-30" });
  });

  it("handles February in a leap year", () => {
    const d = new Date("2024-02-15T03:00:00Z");
    expect(getJSTMonthRange(d)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("handles February in a non-leap year", () => {
    const d = new Date("2025-02-15T03:00:00Z");
    expect(getJSTMonthRange(d)).toEqual({ start: "2025-02-01", end: "2025-02-28" });
  });

  it("respects JST timezone on month-end rollover", () => {
    // JST で月末日の夜 (UTC では翌月) → JST 基準で 4月扱いになるべき
    const d = new Date("2026-04-30T20:00:00Z"); // JST 2026-05-01 05:00
    // 呼び出し時点が 5 月 1 日になるので start=2026-05-01, end=2026-05-31 を期待
    expect(getJSTMonthRange(d)).toEqual({ start: "2026-05-01", end: "2026-05-31" });
  });
});

describe("getJSTPrevMonthRange", () => {
  it("returns previous month in same year", () => {
    const d = new Date("2026-04-17T03:00:00Z");
    expect(getJSTPrevMonthRange(d)).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });

  it("wraps from January to previous December", () => {
    const d = new Date("2026-01-15T03:00:00Z");
    expect(getJSTPrevMonthRange(d)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });
});
