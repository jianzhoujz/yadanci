import type { DayLog } from "@/types";

/**
 * 打卡日志的纯函数层：日期键、区间聚合、连续天数、时长格式化。
 *
 * 只有「按本地日期切分」这一条容易出错的规则值得强调：不能用 `toISOString()`
 * 取日期，那是 UTC，东八区凌晨零点到八点的记录会被算到前一天去。
 */

/** 两次操作间隔超过这么久就不计入学习时长——人已经放下手机去干别的了 */
export const IDLE_GAP_MS = 60_000;

/** 日志保留天数。每天一条、每条六个数字，两年约 30 KB，够小也够用 */
export const KEEP_DAYS = 730;

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function emptyDay(): DayLog {
  return { ms: 0, n: 0, ok: 0, words: 0, fresh: 0, mastered: 0 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地日期键 `YYYY-MM-DD`。字典序即时间序，区间裁剪可以直接比字符串 */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地月份键 `YYYY-MM` */
export function monthKey(ts: number): string {
  return dayKey(ts).slice(0, 7);
}

/** 以本地日历为准的偏移，不做毫秒加减——夏令时的那两天会差一小时 */
function shiftDays(ts: number, days: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

function shiftMonths(ts: number, months: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime();
}

export function addDay(a: DayLog, b: Partial<DayLog>): DayLog {
  return {
    ms: a.ms + (b.ms ?? 0),
    n: a.n + (b.n ?? 0),
    ok: a.ok + (b.ok ?? 0),
    words: a.words + (b.words ?? 0),
    fresh: a.fresh + (b.fresh ?? 0),
    mastered: a.mastered + (b.mastered ?? 0),
  };
}

export function sumDays(logs: Iterable<DayLog>): DayLog {
  let total = emptyDay();
  for (const log of logs) total = addDay(total, log);
  return total;
}

/** 丢掉过老的日志，在水合时跑一次，避免存档无限长大 */
export function pruneDaily(daily: Record<string, DayLog>, now: number): Record<string, DayLog> {
  const cutoff = dayKey(shiftDays(now, -KEEP_DAYS));
  const kept: Record<string, DayLog> = {};
  for (const [key, log] of Object.entries(daily)) {
    if (key >= cutoff) kept[key] = log;
  }
  return kept;
}

/** 图表区间。周 = 最近 7 天，月 = 最近 30 天，年 = 最近 12 个月 */
export type Period = "week" | "month" | "year";

export type Bucket = {
  key: string;
  /** 横轴上的短标签 */
  label: string;
  /** 完整描述，给 tooltip 与无障碍标签用 */
  full: string;
  log: DayLog;
};

/** 横轴每隔几根柱子标一次，太密了手机上会糊成一团 */
export const LABEL_STEP: Record<Period, number> = { week: 1, month: 5, year: 2 };

export function bucketsFor(daily: Record<string, DayLog>, period: Period, now: number): Bucket[] {
  if (period === "year") {
    const months = new Map<string, DayLog>();
    for (const [key, log] of Object.entries(daily)) {
      const m = key.slice(0, 7);
      months.set(m, addDay(months.get(m) ?? emptyDay(), log));
    }
    return Array.from({ length: 12 }, (_, i) => {
      const ts = shiftMonths(now, i - 11);
      const d = new Date(ts);
      const key = monthKey(ts);
      return {
        key,
        label: `${d.getMonth() + 1}月`,
        full: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`,
        log: months.get(key) ?? emptyDay(),
      };
    });
  }

  const days = period === "week" ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const ts = shiftDays(now, i - (days - 1));
    const d = new Date(ts);
    const key = dayKey(ts);
    return {
      key,
      label: period === "week" ? WEEKDAYS[d.getDay()] : String(d.getDate()),
      full: `${d.getMonth() + 1} 月 ${d.getDate()} 日 周${WEEKDAYS[d.getDay()]}`,
      log: daily[key] ?? emptyDay(),
    };
  });
}

/**
 * 连续打卡天数。
 *
 * 今天还没开始背不算断签——从今天往前数，今天空着就从昨天起算，
 * 否则每天零点到第一次打开之间显示的都是「0 天」，很打击人。
 */
export function streakOf(daily: Record<string, DayLog>, now: number): number {
  const active = (ts: number) => (daily[dayKey(ts)]?.n ?? 0) > 0;
  let streak = 0;
  let cursor = active(now) ? now : shiftDays(now, -1);
  while (active(cursor)) {
    streak += 1;
    cursor = shiftDays(cursor, -1);
  }
  return streak;
}

/** 有记录的天数，也就是累计打卡了多少天 */
export function activeDays(daily: Record<string, DayLog>): number {
  let days = 0;
  for (const log of Object.values(daily)) {
    if (log.n > 0) days += 1;
  }
  return days;
}

/** 紧凑的中文时长。不足一分钟给秒，免得刚开始背就显示「0 分钟」 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  if (m > 0) return `${m} 分钟`;
  return `${total} 秒`;
}

/** 正确率，没答过题时给 0 而不是 NaN */
export function accuracyOf(log: DayLog): number {
  return log.n > 0 ? Math.round((log.ok / log.n) * 100) : 0;
}
