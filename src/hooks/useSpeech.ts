import { useCallback, useEffect, useState } from "react";

import type { SpeechFailure } from "@/lib/speech";
import { primeVoices, speak, speechSupported, stopSpeaking } from "@/lib/speech";
import { useStore } from "@/store";

/**
 * 朗读能力。supported 为 false 时调用方应隐藏朗读按钮。
 *
 * supported 为 true 也不代表真能出声——iOS 上的第三方浏览器都有
 * `speechSynthesis` 对象但不一定发得出声音，所以失败要靠 failure 报出来。
 */
export function useSpeech(lang: string) {
  const [supported] = useState(speechSupported);
  const rate = useStore((s) => s.settings.speechRate);
  const preferred = useStore((s) => s.settings.voices[lang]);
  const [speaking, setSpeaking] = useState(false);
  const [failure, setFailure] = useState<SpeechFailure | null>(null);

  useEffect(() => primeVoices(), []);

  // 离开页面时别让朗读继续
  useEffect(() => stopSpeaking, []);

  /**
   * quiet：失败不弹气泡。自动朗读不在用户手势里，iOS 上首张卡常被拦，
   * 每换一张都报错只会烦人；用户点喇叭时再报。
   */
  const say = useCallback(
    (text: string, { quiet = false }: { quiet?: boolean } = {}) => {
      setFailure(null);
      setSpeaking(true);
      speak(text, lang, {
        rate,
        voice: preferred,
        onSettled: () => setSpeaking(false),
        onError: quiet ? undefined : setFailure,
      });
    },
    [lang, rate, preferred],
  );

  const dismissFailure = useCallback(() => setFailure(null), []);

  return { supported, speaking, say, failure, dismissFailure, stop: stopSpeaking };
}
