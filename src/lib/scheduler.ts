import type { Card, CardStat, Settings } from "@/types";

/**
 * 抽词策略：Leitner 盒子 + 加权随机。
 *
 * 不用完整 SM-2——SM-2 要求按日排复习队列，而这个应用的使用方式是
 * 「随时打开、随机出词、背多久算多久」，没有「今天该复习哪些」的概念。
 *
 * 权重 = 等级基础权重 × 时间加成 × 近错加成
 *
 * 实际效果（以熟练度最高的卡为基准 1×）：
 *   没背过        10 × 1 × 1        =  10   → 50 倍
 *   刚答错（降到 lv 0）10 × 1~3 × 2 = 20~60 → 100~300 倍
 *   已掌握 lv 5    0.2 × 1~3 × 1    = 0.2~0.6
 */
export const SCHEDULER = {
  /** 各掌握等级的基础权重，下标即 lv */
  LEVEL_WEIGHTS: [10, 6, 3, 1.5, 0.7, 0.2],
  MAX_LEVEL: 5,
  /** 上次答错的卡，权重乘数 */
  WRONG_BOOST: 2,
  /** 时间加成：每隔这么多天加满 1 倍 */
  TIME_BOOST_DAYS: 3,
  /** 时间加成上限，最终乘数为 1 + 该值 */
  TIME_BOOST_MAX: 2,
  /** 答错时掉几级 —— 惩罚重于奖励，错词能迅速回到高频区 */
  DEMOTE_ON_WRONG: 2,
  /** 最近出现过的卡片数，这些卡不参与抽取，避免连续重复 */
  RECENT_BUFFER: 15,
} as const;

const DAY_MS = 86_400_000;

export function emptyStat(): CardStat {
  return { lv: 0, n: 0, ok: 0, bad: 0, streak: 0, at: 0, lastBad: false };
}

export function isMastered(stat: CardStat | undefined): boolean {
  return (stat?.lv ?? 0) >= SCHEDULER.MAX_LEVEL;
}

export function isNew(stat: CardStat | undefined): boolean {
  return (stat?.n ?? 0) === 0;
}

/** 单张卡在当前时刻的抽取权重，恒为正数 */
export function cardWeight(stat: CardStat | undefined, now: number): number {
  const s = stat ?? emptyStat();
  const lv = Math.min(Math.max(s.lv, 0), SCHEDULER.MAX_LEVEL);
  const base = SCHEDULER.LEVEL_WEIGHTS[lv];

  // 没背过的卡没有「上次出现时间」，不给时间加成，否则会被 epoch 0 算成无穷久
  const timeBoost =
    s.n === 0
      ? 1
      : 1 + Math.min((now - s.at) / DAY_MS / SCHEDULER.TIME_BOOST_DAYS, SCHEDULER.TIME_BOOST_MAX);

  const wrongBoost = s.lastBad ? SCHEDULER.WRONG_BOOST : 1;

  return base * timeBoost * wrongBoost;
}

/** 根据自评结果推进卡片状态 */
export function applyAnswer(stat: CardStat | undefined, correct: boolean, now: number): CardStat {
  const s = stat ?? emptyStat();
  return {
    lv: correct
      ? Math.min(s.lv + 1, SCHEDULER.MAX_LEVEL)
      : Math.max(s.lv - SCHEDULER.DEMOTE_ON_WRONG, 0),
    n: s.n + 1,
    ok: s.ok + (correct ? 1 : 0),
    bad: s.bad + (correct ? 0 : 1),
    streak: correct ? s.streak + 1 : 0,
    at: now,
    lastBad: !correct,
  };
}

/**
 * 按设置筛出可抽取的卡片。
 *
 * 新词节流：没背过的卡按词表原始顺序只放前 N 张进池子。背熟一张，
 * 它就离开「没背过」集合，下一张自动补位。不加这个限制的话，因为新词权重最高，
 * 前期抽到的几乎全是新词，1200 多条会一起涌上来。
 */
export function candidates(
  cards: Card[],
  stats: Record<string, CardStat>,
  settings: Pick<Settings, "sections" | "includeMastered" | "newCardLimit">,
): Card[] {
  const sectionFilter = settings.sections.length > 0 ? new Set(settings.sections) : null;

  const pool: Card[] = [];
  let newSeen = 0;

  for (const card of cards) {
    if (sectionFilter && !sectionFilter.has(card.section)) continue;

    const stat = stats[card.id];
    if (!settings.includeMastered && isMastered(stat)) continue;

    if (isNew(stat)) {
      if (settings.newCardLimit > 0 && newSeen >= settings.newCardLimit) continue;
      newSeen += 1;
    }

    pool.push(card);
  }

  return pool;
}

/**
 * 从候选池里加权随机抽一张。
 *
 * `recent` 是最近出现过的 id（最新的在后），会被排除；若排除后无卡可抽，
 * 说明候选池比缓冲区还小，此时退回完整候选池，否则会卡死抽不出词。
 */
export function pickNext(
  pool: Card[],
  stats: Record<string, CardStat>,
  recent: readonly string[],
  now: number,
  rng: () => number = Math.random,
): Card | null {
  if (pool.length === 0) return null;

  const blocked = new Set(recent.slice(-SCHEDULER.RECENT_BUFFER));
  let usable = pool.filter((c) => !blocked.has(c.id));
  if (usable.length === 0) usable = pool;

  let total = 0;
  const weights = usable.map((card) => {
    const w = cardWeight(stats[card.id], now);
    total += w;
    return w;
  });

  let target = rng() * total;
  for (const [i, w] of weights.entries()) {
    target -= w;
    if (target <= 0) return usable[i];
  }
  // 浮点累加误差兜底
  return usable[usable.length - 1];
}

export type DeckMastery = {
  total: number;
  /** 至少背过一次 */
  seen: number;
  mastered: number;
};

export function masteryOf(cards: Card[], stats: Record<string, CardStat>): DeckMastery {
  let seen = 0;
  let mastered = 0;
  for (const card of cards) {
    const stat = stats[card.id];
    if (!isNew(stat)) seen += 1;
    if (isMastered(stat)) mastered += 1;
  }
  return { total: cards.length, seen, mastered };
}
