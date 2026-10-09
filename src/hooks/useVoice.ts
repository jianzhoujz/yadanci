import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  pickVoice,
  primeVoices,
  speechSupported,
  stopSpeaking,
  subscribeVoices,
  voiceId,
  voicesFor,
  voicesLoaded,
} from "@/lib/speech";
import { useStore } from "@/store";

/** 声音列表的版本号：每次 voiceschanged 加一，让订阅的组件重新取列表 */
let voicesVersion = 0;
subscribeVoices(() => {
  voicesVersion += 1;
});
const getVoicesVersion = () => voicesVersion;

/**
 * 某种语言的声音：可选列表、当前用的是哪个、切换方法。
 * 列表在 Chrome 上是异步到的，所以订阅 voiceschanged。
 */
export function useVoice(lang: string) {
  useSyncExternalStore(subscribeVoices, getVoicesVersion, getVoicesVersion);
  const preferred = useStore((s) => s.settings.voices[lang]);
  const updateSettings = useStore((s) => s.updateSettings);

  useEffect(() => primeVoices(), []);

  const supported = speechSupported();
  const options = supported ? voicesFor(lang) : [];
  const voice = supported ? pickVoice(lang, preferred) : undefined;

  const setVoice = useCallback(
    (id: string) => {
      stopSpeaking();
      const voices = useStore.getState().settings.voices;
      updateSettings({ voices: { ...voices, [lang]: id } });
    },
    [lang, updateSettings],
  );

  return {
    options,
    voice,
    /** 系统已经报告了声音，但没有这种语言的——这时朗读会被拦下 */
    missing: supported && !voice && voicesLoaded(),
    setVoice,
    voiceId,
  };
}
