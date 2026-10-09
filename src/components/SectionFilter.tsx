import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { isMastered } from "@/lib/scheduler";
import { useStore } from "@/store";
import type { Deck } from "@/types";

type Props = {
  deck: Deck;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SectionFilter({ deck, open, onOpenChange }: Props) {
  const selectedList = useStore((s) => s.settings.sections);
  const stats = useStore((s) => s.progress[deck.id].stats);
  const updateSettings = useStore((s) => s.updateSettings);

  // 空数组表示全选，展开成完整集合再交给 UI
  const selected = useMemo(
    () => new Set(selectedList.length > 0 ? selectedList : deck.sections.map((s) => s.code)),
    [selectedList, deck.sections],
  );

  const masteredBySection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of deck.cards) {
      if (isMastered(stats[card.id])) {
        counts.set(card.section, (counts.get(card.section) ?? 0) + 1);
      }
    }
    return counts;
  }, [deck.cards, stats]);

  const commit = (next: Set<string>) => {
    // 全选时存回空数组：语义更清晰，词表将来新增模块也不会被漏掉
    updateSettings({ sections: next.size === deck.sections.length ? [] : [...next] });
  };

  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    commit(next);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>选择模块</DrawerTitle>
          <DrawerDescription>
            模块直接对应考试题型，只背某个题型时在这里缩小范围。
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <ul className="flex flex-col">
            {deck.sections.map((section) => (
              <li key={section.code}>
                <label className="hover:bg-accent/50 flex cursor-pointer items-center gap-3 rounded-lg py-2.5 pr-2 pl-2">
                  <Checkbox
                    checked={selected.has(section.code)}
                    onCheckedChange={() => toggle(section.code)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{section.code}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {section.label}
                      </span>
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {masteredBySection.get(section.code) ?? 0}/{section.count}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <DrawerFooter>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => commit(new Set())}>
              全不选
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => commit(new Set(deck.sections.map((s) => s.code)))}
            >
              全选
            </Button>
          </div>
          <Button onClick={() => onOpenChange(false)}>完成</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
