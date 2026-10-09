import { ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/HeaderControls";
import { InstallHint } from "@/components/InstallHint";
import { StatsPanel } from "@/components/StatsPanel";
import { Progress } from "@/components/ui/progress";
import { isMastered, isNew } from "@/lib/scheduler";
import { DECK_IDS, useStore } from "@/store";
import type { DeckSummary } from "@/types";

export function DeckPicker() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const progress = useStore((s) => s.progress);
  const openDeck = useStore((s) => s.openDeck);

  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      // 只认 store 里登记过的词表，清单里多出来的（比如浏览器缓存的旧清单）不显示
      .then((d: DeckSummary[]) => alive && setDecks(d.filter((x) => DECK_IDS.includes(x.id))))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="flex items-start justify-between gap-3 pt-[calc(3rem+env(safe-area-inset-top))] pb-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">牙！单词</h1>
          <p className="text-muted-foreground mt-2 text-sm">选一个词表开始</p>
        </div>
        <div className="-mr-2 shrink-0">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {failed && <p className="text-destructive text-sm">词表清单加载失败，请刷新页面重试。</p>}

        {!decks && !failed && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            加载中
          </div>
        )}

        {decks?.map((deck) => {
          const stats = progress[deck.id].stats;
          // 清单只给总数，掌握情况得从本地进度里数
          let seen = 0;
          let mastered = 0;
          for (const stat of Object.values(stats)) {
            if (!isNew(stat)) seen += 1;
            if (isMastered(stat)) mastered += 1;
          }
          const pct = deck.count > 0 ? (mastered / deck.count) * 100 : 0;

          return (
            <button
              key={deck.id}
              type="button"
              onClick={() => void openDeck(deck.id)}
              className="bg-card hover:bg-accent/50 focus-visible:ring-ring/50 group rounded-xl border p-5 text-left transition-colors outline-none focus-visible:ring-[3px]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{deck.name}</div>
                  <div className="text-muted-foreground mt-0.5 text-sm">{deck.subtitle}</div>
                </div>
                <ChevronRight className="text-muted-foreground mt-1 size-5 shrink-0" />
              </div>

              <Progress value={pct} className="mt-4" />

              <div className="text-muted-foreground mt-2 flex justify-between text-xs tabular-nums">
                <span>
                  已掌握 {mastered} / {deck.count}
                </span>
                <span>
                  背过 {seen} · {deck.sectionCount} 个模块
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {decks && <StatsPanel decks={decks} />}
      {decks && <InstallHint />}
    </div>
  );
}
