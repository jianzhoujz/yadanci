import { Flame, Share2 } from "lucide-react";
import { useMemo, useState } from "react";

import { ActivityChart } from "@/components/ActivityChart";
import { ShareDialog } from "@/components/ShareDialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  LABEL_STEP,
  accuracyOf,
  activeDays,
  bucketsFor,
  dayKey,
  emptyDay,
  formatDuration,
  streakOf,
  sumDays,
} from "@/lib/activity";
import type { Period } from "@/lib/activity";
import { isMastered } from "@/lib/scheduler";
import type { ShareStats } from "@/lib/shareCard";
import { useStore } from "@/store";
import type { DeckSummary } from "@/types";

const PERIODS: Record<Period, { label: string; title: string }> = {
  week: { label: "周", title: "近 7 天" },
  month: { label: "月", title: "近 30 天" },
  year: { label: "年", title: "近 12 个月" },
};

const PERIOD_KEYS = Object.keys(PERIODS) as Period[];

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-base leading-tight font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * 首页词表列表下方的打卡统计。
 *
 * 日志是跨词表合并的：一天里背了几张表，算同一次打卡。
 */
export function StatsPanel({ decks }: { decks: DeckSummary[] }) {
  const daily = useStore((s) => s.daily);
  const progress = useStore((s) => s.progress);

  const [period, setPeriod] = useState<Period>("week");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // 取一次「现在」即可：从背诵页回到首页时这个组件会重新挂载，跨零点也会重算
  const [now] = useState(() => Date.now());

  const today = daily[dayKey(now)] ?? emptyDay();
  const streak = streakOf(daily, now);

  const buckets = useMemo(() => bucketsFor(daily, period, now), [daily, period, now]);
  const active = buckets.find((b) => b.key === activeKey);
  const shown = active?.log ?? sumDays(buckets.map((b) => b.log));

  const mastered = useMemo(() => {
    const all = decks.map((deck) => progress[deck.id].stats);
    let total = 0;
    for (const stats of all) {
      for (const stat of Object.values(stats)) {
        if (isMastered(stat)) total += 1;
      }
    }
    return total;
  }, [decks, progress]);

  const shareStats = useMemo<ShareStats>(
    () => ({
      at: now,
      today,
      streak,
      days: activeDays(daily),
      totalWords: sumDays(Object.values(daily)).words,
      mastered,
      week: bucketsFor(daily, "week", now),
    }),
    [now, today, streak, daily, mastered],
  );

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">学习统计</h2>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="text-ok bg-ok/10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums">
              <Flame className="size-3.5" />
              连续 {streak} 天
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 /> 分享
          </Button>
        </div>
      </div>

      <div className="bg-card mt-3 rounded-xl border p-4">
        <dl className="grid grid-cols-3 gap-3">
          <Tile label="今日时长" value={formatDuration(today.ms)} />
          <Tile label="学习词数" value={String(today.words)} />
          <Tile label="掌握词数" value={String(today.mastered)} />
        </dl>
        <p className="text-muted-foreground mt-3 text-xs tabular-nums">
          今日自评 {today.n} 次 · 正确率 {accuracyOf(today)}% · 新词 {today.fresh}
        </p>

        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-xs font-medium">
              {active?.full ?? PERIODS[period].title}
            </div>

            <ToggleGroup
              type="single"
              className="shrink-0"
              value={period}
              onValueChange={(v) => {
                if (!v) return;
                setPeriod(v as Period);
                setActiveKey(null);
              }}
            >
              {PERIOD_KEYS.map((key) => (
                <ToggleGroupItem key={key} value={key} className="px-2.5 py-1 text-xs">
                  {PERIODS[key].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="text-muted-foreground mt-1 text-xs tabular-nums">
            学习 {shown.words} 词 · {formatDuration(shown.ms)} · 正确率 {accuracyOf(shown)}%
          </div>

          <div className="mt-3">
            <ActivityChart
              buckets={buckets}
              labelStep={LABEL_STEP[period]}
              activeKey={activeKey}
              onActiveChange={setActiveKey}
            />
          </div>
        </div>
      </div>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} stats={shareStats} />
    </section>
  );
}
