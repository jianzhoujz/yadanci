import {
  BarChart3,
  Check,
  ChevronLeft,
  Loader2,
  Menu,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ProgressDialog } from "@/components/ProgressDialog";
import { SectionFilter } from "@/components/SectionFilter";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StudyCard } from "@/components/StudyCard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnswerKeys } from "@/hooks/useAnswerKeys";
import { useStudyClock } from "@/hooks/useStudyClock";
import { useStore } from "@/store";
import type { Mode } from "@/types";

export function StudyView() {
  const deck = useStore((s) => s.deck);
  const status = useStore((s) => s.status);
  const current = useStore((s) => s.current);
  const revealed = useStore((s) => s.revealed);
  const session = useStore((s) => s.session);
  const mode = useStore((s) => s.settings.mode);
  const autoSpeak = useStore((s) => s.settings.autoSpeak);
  const theme = useStore((s) => s.settings.theme);
  const reveal = useStore((s) => s.reveal);
  const answer = useStore((s) => s.answer);
  const leaveDeck = useStore((s) => s.leaveDeck);
  const updateSettings = useStore((s) => s.updateSettings);

  const [filterOpen, setFilterOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sectionLabels = useMemo(
    () => new Map(deck?.sections.map((s) => [s.code, s.label]) ?? []),
    [deck],
  );

  const onAnswer = useCallback((correct: boolean) => answer(correct), [answer]);

  useStudyClock(status === "ready");

  useAnswerKeys({
    enabled:
      status === "ready" && current !== null && !filterOpen && !progressOpen && !settingsOpen,
    revealed,
    onReveal: reveal,
    onAnswer,
  });

  if (status === "loading" || !deck) {
    return (
      <div className="text-muted-foreground flex h-dvh items-center justify-center gap-2 text-sm">
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3">
            <p>词表加载失败。</p>
            <Button variant="outline" onClick={leaveDeck}>
              返回
            </Button>
          </div>
        ) : (
          <>
            <Loader2 className="size-4 animate-spin" />
            加载词表
          </>
        )}
      </div>
    );
  }

  const answered = session.ok + session.bad;
  const rate = answered > 0 ? Math.round((session.ok / answered) * 100) : 0;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-xl flex-col px-3 sm:px-4">
      <header className="shrink-0 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="nav"
            className="-ml-1.5"
            onClick={leaveDeck}
            aria-label="返回词表列表"
          >
            <ChevronLeft />
          </Button>
          <div className="min-w-0 flex-1 truncate text-lg font-semibold">{deck.name}</div>
          {answered > 0 && (
            <span className="text-muted-foreground mr-1 shrink-0 text-sm tabular-nums">
              {answered} 题 · {rate}%
            </span>
          )}

          {/* modal={false}：菜单项打开弹窗时，别让菜单的焦点锁和弹窗的抢在一起卡住页面 */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="nav" className="-mr-1.5" aria-label="菜单">
                <Menu />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setFilterOpen(true)}>
                <SlidersHorizontal />
                选择模块
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setProgressOpen(true)}>
                <BarChart3 />
                学习进度
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings />
                设置
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => updateSettings({ theme: theme === "dark" ? "light" : "dark" })}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
                {theme === "dark" ? "浅色模式" : "深色模式"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ToggleGroup
          type="single"
          className="mt-2 w-full"
          value={mode}
          onValueChange={(v) => v && updateSettings({ mode: v as Mode })}
        >
          <ToggleGroupItem value="front-to-gloss">看词猜义</ToggleGroupItem>
          <ToggleGroupItem value="gloss-to-front">看义猜词</ToggleGroupItem>
        </ToggleGroup>
      </header>

      <main className="min-h-0 flex-1 py-2">
        {current ? (
          <StudyCard
            card={current}
            deck={deck}
            mode={mode}
            revealed={revealed}
            autoSpeak={autoSpeak}
            sectionLabel={sectionLabels.get(current.section) ?? current.section}
            onReveal={reveal}
          />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 text-center text-sm">
            <p>
              当前筛选条件下没有可背的词。
              <br />
              可能是模块全没选，或者这些模块都背完了。
            </p>
            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              调整模块
            </Button>
          </div>
        )}
      </main>

      <footer className="shrink-0 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {revealed && current ? (
          <div className="flex gap-3">
            <Button variant="bad" size="answer" onClick={() => onAnswer(false)}>
              <X />
              没记住
              <kbd aria-hidden className="ml-1 hidden font-mono text-xs opacity-70 sm:inline">
                ←
              </kbd>
            </Button>
            <Button variant="ok" size="answer" onClick={() => onAnswer(true)}>
              <Check />
              记住了
              <kbd aria-hidden className="ml-1 hidden font-mono text-xs opacity-70 sm:inline">
                →
              </kbd>
            </Button>
          </div>
        ) : (
          <Button size="answer" className="w-full" disabled={!current} onClick={reveal}>
            看答案
            <kbd aria-hidden className="ml-1 hidden font-mono text-xs opacity-70 sm:inline">
              空格
            </kbd>
          </Button>
        )}
      </footer>

      <SectionFilter deck={deck} open={filterOpen} onOpenChange={setFilterOpen} />
      <ProgressDialog deck={deck} open={progressOpen} onOpenChange={setProgressOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
