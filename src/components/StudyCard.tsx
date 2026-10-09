import { Volume2 } from "lucide-react";
import { useEffect } from "react";

import { SpeechErrorToast } from "@/components/SpeechErrorToast";
import { VoicePicker } from "@/components/VoicePicker";
import { useFitWords } from "@/hooks/useFitWords";
import { useSpeech } from "@/hooks/useSpeech";
import { cn } from "@/lib/utils";
import type { Card, Deck, Mode } from "@/types";

type Props = {
  card: Card;
  deck: Deck;
  mode: Mode;
  revealed: boolean;
  sectionLabel: string;
  autoSpeak: boolean;
  onReveal: () => void;
};

/** 词条本身：文本 + 音标 + 朗读按钮。只在该露出答案时才渲染 */
function TermBlock({
  card,
  lang,
  big,
  canSpeak,
  onSpeak,
}: {
  card: Card;
  lang: string;
  big: boolean;
  canSpeak: boolean;
  onSpeak: () => void;
}) {
  // 超长单词（disproportionately、l'embourgeoisement）按比例缩小字号放进一行，不折断
  const termRef = useFitWords<HTMLDivElement>(card.front);
  return (
    <div>
      <div className="flex items-start gap-2">
        <div
          ref={termRef}
          lang={lang}
          className={cn(
            // break-words 只是兜底：缩到下限还放不下的极端情况才会在词中间折行
            "min-w-0 flex-1 leading-snug font-semibold break-words",
            big ? "text-3xl sm:text-4xl" : "text-2xl font-medium",
          )}
        >
          {card.front}
        </div>
        {canSpeak && (
          <button
            type="button"
            aria-label="朗读"
            onClick={(e) => {
              e.stopPropagation();
              onSpeak();
            }}
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent focus-visible:ring-ring/50 -my-1.5 shrink-0 rounded-xl transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
              big ? "p-3" : "p-2.5",
            )}
          >
            <Volume2 className={big ? "size-8" : "size-7"} />
          </button>
        )}
      </div>

      {card.ipa && (
        // 比正文浅一点区分层次，但不用 muted：那个灰度在手机上看不清
        <div className="text-foreground/75 mt-2 text-lg tracking-wide">{card.ipa}</div>
      )}
    </div>
  );
}

export function StudyCard({
  card,
  deck,
  mode,
  revealed,
  sectionLabel,
  autoSpeak,
  onReveal,
}: Props) {
  const askingForGloss = mode === "front-to-gloss";
  const { supported, say, failure, dismissFailure } = useSpeech(deck.lang);

  // 看义猜词时，翻面前词条是答案，绝不能朗读出来
  const termVisible = askingForGloss || revealed;

  // 词条一露面就读：看词猜义是换卡时，看义猜词要等翻面
  useEffect(() => {
    if (autoSpeak && termVisible && supported) say(card.front, { quiet: true });
  }, [autoSpeak, termVisible, supported, say, card.id, card.front]);

  const glosses = (
    <div lang="zh" className="leading-snug break-words">
      {card.glosses.join(" / ")}
    </div>
  );

  return (
    <>
      <div
        className={cn(
          "bg-card flex h-full w-full flex-col rounded-2xl border p-5 sm:p-6",
          !revealed && "cursor-pointer",
        )}
        onClick={!revealed ? onReveal : undefined}
      >
        <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
          <span className="bg-muted text-foreground/70 rounded px-1.5 py-0.5 font-medium">
            {card.section}
          </span>
          <span className="truncate">{sectionLabel}</span>
          {supported && <VoicePicker lang={deck.lang} className="ml-auto max-w-[55%]" />}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-6">
          {/* 题面 */}
          {askingForGloss ? (
            <TermBlock
              card={card}
              lang={deck.lang}
              big
              canSpeak={supported}
              onSpeak={() => say(card.front)}
            />
          ) : (
            <div className="text-3xl leading-snug font-semibold sm:text-4xl">{glosses}</div>
          )}

          {card.pos && <div className="text-foreground/70 mt-2 text-base italic">{card.pos}</div>}

          {revealed && (
            <div className="mt-6 flex flex-col gap-4 border-t pt-6">
              {/* 答案 */}
              {askingForGloss ? (
                <div className="text-2xl font-medium">{glosses}</div>
              ) : (
                <TermBlock
                  card={card}
                  lang={deck.lang}
                  big={false}
                  canSpeak={supported && termVisible}
                  onSpeak={() => say(card.front)}
                />
              )}

              {card.note && (
                <div>
                  <div className="text-muted-foreground mb-1 text-xs font-medium">用法要点</div>
                  <p className="text-sm leading-relaxed">{card.note}</p>
                </div>
              )}

              {card.example && (
                <div>
                  <div className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-medium">
                    例句
                    {supported && (
                      <button
                        type="button"
                        aria-label="朗读例句"
                        onClick={() => say(card.example)}
                        className="text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent focus-visible:ring-ring/50 -my-1.5 rounded-lg p-2 transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                      >
                        <Volume2 className="size-5" />
                      </button>
                    )}
                  </div>
                  <p lang={deck.lang} className="text-sm leading-relaxed italic">
                    {card.example}
                  </p>
                </div>
              )}

              <div className="text-muted-foreground text-xs">{card.theme}</div>
            </div>
          )}
        </div>
      </div>

      {failure && (
        <SpeechErrorToast
          key={failure.detail ?? failure.message}
          failure={failure}
          onDismiss={dismissFailure}
        />
      )}
    </>
  );
}
