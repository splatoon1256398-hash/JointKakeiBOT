import { describe, it, expect } from "vitest";
import { createTimer } from "./perf";

describe("createTimer", () => {
  it("records marks and builds a Server-Timing header", async () => {
    const t = createTimer();
    // 実測時間が 0 だとヘッダが ;dur=0 になるので少しだけ待つ
    await new Promise((r) => setTimeout(r, 5));
    t.mark("stepA");
    await new Promise((r) => setTimeout(r, 5));
    t.mark("stepB");

    const header = t.toServerTiming();
    expect(header).toMatch(/^stepA;dur=\d+(\.\d+)?, stepB;dur=\d+(\.\d+)?, total;dur=\d+(\.\d+)?$/);

    const record = t.toRecord();
    expect(record.stepA).toBeGreaterThan(0);
    expect(record.stepB).toBeGreaterThan(0);
    expect(record.total).toBeGreaterThanOrEqual(record.stepA + record.stepB);
  });

  it("sanitizes label characters invalid for Server-Timing", async () => {
    const t = createTimer();
    await new Promise((r) => setTimeout(r, 1));
    t.mark("step with space; and comma");
    const header = t.toServerTiming();
    // スペース/セミコロン/カンマがアンダースコアに置換されている
    expect(header).toMatch(/step_with_space__and_comma;dur=/);
  });

  it("set() explicitly writes a ms value without advancing the clock", () => {
    const t = createTimer();
    t.set("external", 123.45);
    const record = t.toRecord();
    expect(record.external).toBe(123.45);
  });
});
