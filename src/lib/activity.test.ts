import { describe, expect, it } from "vite-plus/test";

import {
  accuracyOf,
  activeDays,
  bucketsFor,
  dayKey,
  emptyDay,
  formatDuration,
  pruneDaily,
  streakOf,
  sumDays,
} from "@/lib/activity";
import type { DayLog } from "@/types";

/** 本地时间的某一天，避开 UTC 换算 */
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

function log(patch: Partial<DayLog>): DayLog {
  return { ...emptyDay(), ...patch };
}

describe("dayKey", () => {
  it("按本地日期切分，凌晨的记录仍算当天", () => {
    expect(dayKey(at(2026, 1, 1, 0))).toBe("2026-01-01");
    expect(dayKey(at(2026, 1, 1, 23))).toBe("2026-01-01");
    expect(dayKey(at(2026, 9, 5, 6))).toBe("2026-09-05");
  });

  it("字典序等于时间序，区间裁剪才能直接比字符串", () => {
    expect(dayKey(at(2026, 9, 9)) < dayKey(at(2026, 9, 10))).toBe(true);
    expect(dayKey(at(2025, 12, 31)) < dayKey(at(2026, 1, 1))).toBe(true);
  });
});

describe("bucketsFor", () => {
  const now = at(2026, 9, 21);
  const daily = {
    "2026-09-21": log({ n: 4, words: 3 }),
    "2026-09-19": log({ n: 2, words: 2 }),
    "2026-08-30": log({ n: 9, words: 7 }),
    "2025-11-02": log({ n: 1, words: 1 }),
    "2025-09-09": log({ n: 5, words: 5 }),
  };

  it("周视图给最近 7 天，最后一根柱子是今天", () => {
    const buckets = bucketsFor(daily, "week", now);
    expect(buckets).toHaveLength(7);
    expect(buckets[6].key).toBe("2026-09-21");
    expect(buckets[6].log.words).toBe(3);
    expect(buckets[4].key).toBe("2026-09-19");
    expect(buckets[0].key).toBe("2026-09-15");
  });

  it("没有记录的日子补空，不留空洞", () => {
    const buckets = bucketsFor(daily, "week", now);
    expect(buckets[5].log).toEqual(emptyDay());
  });

  it("月视图给最近 30 天", () => {
    const buckets = bucketsFor(daily, "month", now);
    expect(buckets).toHaveLength(30);
    expect(buckets[0].key).toBe("2026-08-23");
    expect(buckets.find((b) => b.key === "2026-08-30")?.log.words).toBe(7);
  });

  it("年视图按月合计最近 12 个月，落在窗口外的不算", () => {
    const buckets = bucketsFor({ ...daily, "2026-08-02": log({ n: 3, words: 3 }) }, "year", now);
    expect(buckets).toHaveLength(12);
    expect(buckets[11].key).toBe("2026-09");
    expect(buckets[10].key).toBe("2026-08");
    expect(buckets[10].log.words).toBe(10);
    expect(buckets[0].key).toBe("2025-10");
    expect(buckets.some((b) => b.key === "2025-09")).toBe(false);
  });
});

describe("streakOf", () => {
  const now = at(2026, 9, 21);

  it("今天还没背不算断签，从昨天往前数", () => {
    const daily = { "2026-09-20": log({ n: 1 }), "2026-09-19": log({ n: 1 }) };
    expect(streakOf(daily, now)).toBe(2);
  });

  it("今天背了就从今天开始数", () => {
    const daily = {
      "2026-09-21": log({ n: 1 }),
      "2026-09-20": log({ n: 1 }),
      "2026-09-18": log({ n: 1 }),
    };
    expect(streakOf(daily, now)).toBe(2);
  });

  it("只有时长没有自评的日子不算打卡", () => {
    expect(streakOf({ "2026-09-20": log({ ms: 60_000 }) }, now)).toBe(0);
  });

  it("从没背过是 0 天", () => {
    expect(streakOf({}, now)).toBe(0);
  });
});

describe("pruneDaily", () => {
  it("丢掉两年前的日志，留下窗口内的", () => {
    const now = at(2026, 9, 21);
    const kept = pruneDaily({ "2026-09-20": log({ n: 1 }), "2024-01-01": log({ n: 1 }) }, now);
    expect(Object.keys(kept)).toEqual(["2026-09-20"]);
  });
});

describe("汇总", () => {
  it("sumDays 逐字段相加", () => {
    const total = sumDays([log({ ms: 100, n: 2, ok: 1, words: 2 }), log({ ms: 50, n: 3, ok: 3 })]);
    expect(total).toEqual(log({ ms: 150, n: 5, ok: 4, words: 2 }));
  });

  it("activeDays 只数真的答过题的天", () => {
    expect(activeDays({ a: log({ n: 3 }), b: log({ ms: 999 }), c: log({ n: 1 }) })).toBe(2);
  });

  it("没答过题时正确率给 0 而不是 NaN", () => {
    expect(accuracyOf(emptyDay())).toBe(0);
    expect(accuracyOf(log({ n: 4, ok: 3 }))).toBe(75);
  });
});

describe("formatDuration", () => {
  it("不足一分钟给秒，免得刚开始背就显示 0 分钟", () => {
    expect(formatDuration(0)).toBe("0 秒");
    expect(formatDuration(45_000)).toBe("45 秒");
  });

  it("按分、小时逐级进位", () => {
    expect(formatDuration(90_000)).toBe("1 分钟");
    expect(formatDuration(3_600_000)).toBe("1 小时");
    expect(formatDuration(3_900_000)).toBe("1 小时 5 分");
  });
});
