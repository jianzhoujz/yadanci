import { describe, expect, it } from "vite-plus/test";

import {
  applyAnswer,
  candidates,
  cardWeight,
  emptyStat,
  isMastered,
  isNew,
  masteryOf,
  pickNext,
  SCHEDULER,
} from "@/lib/scheduler";
import type { Card, CardStat } from "@/types";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function card(id: string, section = "A"): Card {
  return { id, section, theme: "t", front: id, pos: "n.", glosses: ["g"], note: "", example: "" };
}

function stat(patch: Partial<CardStat>): CardStat {
  return { ...emptyStat(), ...patch };
}

describe("cardWeight", () => {
  it("没背过的卡权重最高，随等级递减", () => {
    const weights = SCHEDULER.LEVEL_WEIGHTS.map((_, lv) =>
      cardWeight(stat({ lv, n: 1, at: NOW }), NOW),
    );
    expect(weights[0]).toBeGreaterThan(weights[1]);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    }
  });

  it("未知状态等同于全新卡片", () => {
    expect(cardWeight(undefined, NOW)).toBe(cardWeight(emptyStat(), NOW));
  });

  it("新卡不吃时间加成，不会因为 at=0 被算成无穷久", () => {
    expect(cardWeight(emptyStat(), NOW)).toBe(SCHEDULER.LEVEL_WEIGHTS[0]);
  });

  it("上次答错的卡权重翻倍", () => {
    const base = cardWeight(stat({ lv: 2, n: 3, at: NOW }), NOW);
    const failed = cardWeight(stat({ lv: 2, n: 3, at: NOW, lastBad: true }), NOW);
    expect(failed).toBe(base * SCHEDULER.WRONG_BOOST);
  });

  it("时间加成随间隔增长并封顶在 3 倍", () => {
    const fresh = cardWeight(stat({ lv: 2, n: 1, at: NOW }), NOW);
    const threeDays = cardWeight(stat({ lv: 2, n: 1, at: NOW - 3 * DAY }), NOW);
    const oneYear = cardWeight(stat({ lv: 2, n: 1, at: NOW - 365 * DAY }), NOW);

    expect(threeDays).toBeCloseTo(fresh * 2);
    expect(oneYear).toBeCloseTo(fresh * (1 + SCHEDULER.TIME_BOOST_MAX));
  });

  it("错词权重显著高于已掌握的词", () => {
    const wrong = cardWeight(stat({ lv: 0, n: 5, at: NOW, lastBad: true }), NOW);
    const mastered = cardWeight(stat({ lv: 5, n: 8, at: NOW }), NOW);
    expect(wrong / mastered).toBeGreaterThan(50);
  });
});

describe("applyAnswer", () => {
  it("答对升一级并累计连对", () => {
    const next = applyAnswer(stat({ lv: 1, n: 2, ok: 1, streak: 1 }), true, NOW);
    expect(next).toMatchObject({ lv: 2, n: 3, ok: 2, streak: 2, at: NOW, lastBad: false });
  });

  it("答错掉两级、连对清零、标记 lastBad", () => {
    const next = applyAnswer(stat({ lv: 3, n: 5, streak: 3 }), false, NOW);
    expect(next).toMatchObject({ lv: 1, n: 6, bad: 1, streak: 0, lastBad: true });
  });

  it("等级不会越界", () => {
    expect(applyAnswer(stat({ lv: SCHEDULER.MAX_LEVEL }), true, NOW).lv).toBe(SCHEDULER.MAX_LEVEL);
    expect(applyAnswer(stat({ lv: 1 }), false, NOW).lv).toBe(0);
  });

  it("惩罚重于奖励：答对一次补不回答错一次", () => {
    const wrong = applyAnswer(stat({ lv: 3 }), false, NOW);
    const recovered = applyAnswer(wrong, true, NOW);
    expect(recovered.lv).toBeLessThan(3);
  });
});

describe("candidates", () => {
  const cards = [card("a", "A"), card("b", "A"), card("c", "B"), card("d", "B")];
  const all = { sections: [], includeMastered: false, newCardLimit: 0 };

  it("空 sections 表示不筛选", () => {
    expect(candidates(cards, {}, all)).toHaveLength(4);
  });

  it("按模块筛选", () => {
    const pool = candidates(cards, {}, { ...all, sections: ["B"] });
    expect(pool.map((c) => c.id)).toEqual(["c", "d"]);
  });

  it("默认排除已掌握的卡，开关打开后放回", () => {
    const stats = { a: stat({ lv: 5, n: 6 }) };
    expect(candidates(cards, stats, all).map((c) => c.id)).toEqual(["b", "c", "d"]);
    expect(candidates(cards, stats, { ...all, includeMastered: true })).toHaveLength(4);
  });

  it("新词节流只放行前 N 张没背过的卡", () => {
    const pool = candidates(cards, {}, { ...all, newCardLimit: 2 });
    expect(pool.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("背过的卡不占新词名额，且背熟一张后下一张自动补位", () => {
    const stats = { a: stat({ lv: 2, n: 3, at: NOW }) };
    const pool = candidates(cards, stats, { ...all, newCardLimit: 2 });
    expect(pool.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("pickNext", () => {
  const cards = [card("a"), card("b"), card("c")];

  it("池子为空时返回 null", () => {
    expect(pickNext([], {}, [], NOW)).toBeNull();
  });

  it("排除最近出现过的卡", () => {
    const picked = pickNext(cards, {}, ["a", "b"], NOW, () => 0.5);
    expect(picked?.id).toBe("c");
  });

  it("候选池比缓冲区还小时退回完整池子，不会抽不出词", () => {
    expect(pickNext(cards, {}, ["a", "b", "c"], NOW, () => 0.5)).not.toBeNull();
  });

  it("rng 取边界值时仍返回池内卡片", () => {
    expect(pickNext(cards, {}, [], NOW, () => 0)?.id).toBe("a");
    expect(pickNext(cards, {}, [], NOW, () => 0.999999)?.id).toBe("c");
  });

  it("权重高的卡被抽中的频率显著更高", () => {
    const stats = {
      a: stat({ lv: 5, n: 9, at: NOW }),
      b: stat({ lv: 5, n: 9, at: NOW }),
      c: emptyStat(),
    };
    // 固定步长扫一遍 [0,1)，等价于按权重占比统计
    let cHits = 0;
    const runs = 1000;
    for (let i = 0; i < runs; i++) {
      const r = i / runs;
      if (pickNext(cards, stats, [], NOW, () => r)?.id === "c") cHits += 1;
    }
    expect(cHits / runs).toBeGreaterThan(0.9);
  });
});

describe("masteryOf", () => {
  it("分别统计总数、背过的和已掌握的", () => {
    const cards = [card("a"), card("b"), card("c")];
    const stats = { a: stat({ lv: 5, n: 6 }), b: stat({ lv: 1, n: 1 }) };
    expect(masteryOf(cards, stats)).toEqual({ total: 3, seen: 2, mastered: 1 });
  });
});

describe("状态判定", () => {
  it("isNew 看出现次数而非等级", () => {
    expect(isNew(undefined)).toBe(true);
    expect(isNew(stat({ n: 1 }))).toBe(false);
  });

  it("isMastered 以最高等级为准", () => {
    expect(isMastered(stat({ lv: SCHEDULER.MAX_LEVEL }))).toBe(true);
    expect(isMastered(stat({ lv: SCHEDULER.MAX_LEVEL - 1 }))).toBe(false);
  });
});
