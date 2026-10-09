import { describe, expect, it } from "vite-plus/test";

import { MIN_FIT_SCALE, fitScale } from "@/hooks/useFitWords";

describe("fitScale", () => {
  it("放得下就不缩", () => {
    expect(fitScale(200, 230)).toBe(1);
    expect(fitScale(230, 230)).toBe(1);
  });

  it("放不下就按比例缩到刚好放进一行，留一点余量", () => {
    const scale = fitScale(352, 230);
    expect(352 * scale).toBeLessThan(230);
    expect(352 * scale).toBeGreaterThan(230 * 0.95);
  });

  it("缩到下限为止，不会小得没法看", () => {
    expect(fitScale(1000, 230)).toBe(MIN_FIT_SCALE);
  });

  it("量不出宽度（测试环境没有 canvas）时不缩", () => {
    expect(fitScale(0, 230)).toBe(1);
    expect(fitScale(300, 0)).toBe(1);
  });
});
