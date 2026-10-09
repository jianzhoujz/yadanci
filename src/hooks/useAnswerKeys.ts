import { useEffect } from "react";

/**
 * PC 端快捷键：空格 / 回车翻面，← 或 J 判错，→ 或 K 判对。
 * 只在答案已揭晓后才接受判定键，避免手滑在没看答案时就打了分。
 */
export function useAnswerKeys(opts: {
  enabled: boolean;
  revealed: boolean;
  onReveal: () => void;
  onAnswer: (correct: boolean) => void;
}) {
  const { enabled, revealed, onReveal, onAnswer } = opts;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onReveal();
        }
        return;
      }

      if (e.key === "ArrowRight" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        onAnswer(true);
      } else if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        onAnswer(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, revealed, onReveal, onAnswer]);
}
