import { Download, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { PanelDialog } from "@/components/PanelDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isMastered, isNew, masteryOf } from "@/lib/scheduler";
import { downloadProgress, importProgress } from "@/lib/storage";
import { useStore } from "@/store";
import type { Deck } from "@/types";

type Props = {
  deck: Deck;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** 当前词表的掌握进度，以及备份与重置 */
export function ProgressDialog({ deck, open, onOpenChange }: Props) {
  const stats = useStore((s) => s.progress[deck.id].stats);
  const resetDeck = useStore((s) => s.resetDeck);

  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState("");

  const overall = useMemo(() => masteryOf(deck.cards, stats), [deck.cards, stats]);

  const bySection = useMemo(() => {
    const rows = new Map<string, { seen: number; mastered: number }>();
    for (const card of deck.cards) {
      const row = rows.get(card.section) ?? { seen: 0, mastered: 0 };
      if (!isNew(stats[card.id])) row.seen += 1;
      if (isMastered(stats[card.id])) row.mastered += 1;
      rows.set(card.section, row);
    }
    return deck.sections.map((section) => ({
      ...section,
      ...(rows.get(section.code) ?? { seen: 0, mastered: 0 }),
    }));
  }, [deck.cards, deck.sections, stats]);

  const onImportFile = async (file: File) => {
    const ok = importProgress(await file.text());
    if (ok) {
      // 进度是在水合时读入 store 的，导入后必须重载页面才能生效
      window.location.reload();
    } else {
      setImportError("这个文件不是有效的进度备份。");
    }
  };

  return (
    <PanelDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${deck.name} · 学习进度`}
      description={`已掌握 ${overall.mastered} / ${overall.total}，背过 ${overall.seen}`}
    >
      <div>
        <Progress value={(overall.mastered / overall.total) * 100} className="h-2.5" />
        <ul className="mt-4 flex flex-col gap-2.5">
          {bySection.map((section) => (
            <li key={section.code}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate">
                  <span className="font-medium">{section.code}</span>
                  <span className="text-muted-foreground ml-2">{section.label}</span>
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {section.mastered}/{section.count}
                </span>
              </div>
              <Progress value={(section.mastered / section.count) * 100} className="h-1.5" />
            </li>
          ))}
        </ul>
      </div>

      <section className="flex flex-col gap-3 border-t pt-5">
        <div>
          <div className="text-sm font-medium">备份</div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            进度只存在这台设备的浏览器里。iOS Safari 连续 7 天没访问就可能清掉，
            建议「添加到主屏幕」，并定期导出备份。
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={downloadProgress}>
            <Download /> 导出
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
            <Upload /> 导入
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
            e.target.value = "";
          }}
        />

        {importError && <p className="text-destructive text-xs">{importError}</p>}

        <Button
          variant={confirmReset ? "destructive" : "outline"}
          onClick={() => {
            if (confirmReset) {
              resetDeck(deck.id);
              setConfirmReset(false);
              onOpenChange(false);
            } else {
              setConfirmReset(true);
            }
          }}
          onBlur={() => setConfirmReset(false)}
        >
          {confirmReset ? "再点一次，清空本词表进度" : `重置 ${deck.name} 的进度`}
        </Button>
      </section>
    </PanelDialog>
  );
}
