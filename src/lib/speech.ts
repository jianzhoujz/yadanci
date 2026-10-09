/**
 * 浏览器自带的语音合成（Web Speech API）。
 *
 * 几个平台差异必须处理：
 * - `getVoices()` 在 Chrome 上首次是空数组，要等 `voiceschanged` 事件
 * - iOS Safari 要求首次朗读发生在用户手势的调用栈里，所以只在点击里调用
 * - iOS 上连续朗读不先 `cancel()` 会卡住不发声；但**空队列时也 cancel() 反而会
 *   把 WebKit 的队列弄僵**，所以只在真的在说/在排队时才取消
 * - iOS 上所有浏览器都是 WKWebView，但各家配置的 AVAudioSession 不同：
 *   有的会被侧边静音拨片静掉、有的不会。`speak()` 照常 resolve，只是没声音，
 *   所以要有一个「接受了请求但迟迟没 start」的看门狗，不然用户只看到按钮没反应
 * - `utterance.lang` 只是挑声音的提示，**决定发音规则的是声音本身**。系统里没有
 *   目标语言的声音时，引擎会不声不响地退回默认声音（中文 Windows 上是中文声音），
 *   按那种语言的规则念，英语单词会被读成中文腔。所以宁可报错也不用别的语言的声音
 */
const LANG_PREFERENCE: Record<string, string[]> = {
  // 优先美音，没有再退回英音
  en: ["en-US", "en-GB"],
};

/** 朗读失败时给调用方的描述。message 给用户看，detail 给排查用 */
export type SpeechFailure = {
  message: string;
  detail?: string;
};

/** `SpeechSynthesisErrorEvent.error` 的取值 → 人话 */
const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "浏览器拦下了这次朗读，通常是它没把这次调用算作用户点击。再点一下喇叭试试。",
  "audio-busy": "音频设备正忙，可能有别的应用或标签页在占用。",
  "audio-hardware": "系统找不到可用的音频输出设备。",
  network: "这个声音要联网合成，当前网络不通。",
  "synthesis-unavailable": "这个浏览器没有可用的语音合成引擎。",
  "synthesis-failed": "语音合成引擎处理这段文本时失败了。",
  "language-unavailable": "系统里没有装这个语言的语音包。",
  "voice-unavailable": "选中的声音已经不可用了。",
  "text-too-long": "这段文本太长，引擎读不下来。",
  "invalid-argument": "语速或音高超出了引擎支持的范围。",
};

/** 我们自己调 cancel() 造成的，属于正常打断，不该弹错误 */
const BENIGN_ERRORS = new Set(["interrupted", "canceled"]);

/** 没指定语速时用的默认值。背单词要听清音节，比引擎默认慢一些 */
const DEFAULT_RATE = 0.5;

/** 点了没声音时，多久算「引擎吞了这次请求」 */
const START_TIMEOUT_MS = 2000;

const LANG_NAMES: Record<string, string> = { en: "英语", fr: "法语" };
const REGION_NAMES: Record<string, string> = {
  CA: "加拿大",
  US: "美国",
  GB: "英国",
  AU: "澳大利亚",
  IN: "印度",
  IE: "爱尔兰",
  NZ: "新西兰",
  FR: "法国",
  BE: "比利时",
  CH: "瑞士",
};

export function langName(lang: string): string {
  return LANG_NAMES[lang] ?? lang;
}

let voices: SpeechSynthesisVoice[] = [];
const voiceListeners = new Set<() => void>();
let watchdog: ReturnType<typeof setTimeout> | undefined;

function clearWatchdog(): void {
  if (watchdog !== undefined) {
    clearTimeout(watchdog);
    watchdog = undefined;
  }
}

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  // 查值不查键：部分内嵌 WebView 里 speechSynthesis 属性存在但值是 undefined，
  // 只用 `in` 判断会在后面调 getVoices() 时直接抛异常
  return Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === "function";
}

/** 预热声音列表。Chrome 首次返回空，靠 voiceschanged 补上 */
export function primeVoices(): () => void {
  if (!speechSupported()) return () => {};

  const load = () => {
    try {
      voices = window.speechSynthesis.getVoices();
    } catch {
      voices = [];
    }
    voiceListeners.forEach((fn) => fn());
  };
  load();
  window.speechSynthesis.addEventListener("voiceschanged", load);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
}

/** 声音列表加载或变化时通知。给 React 的 useSyncExternalStore 用 */
export function subscribeVoices(fn: () => void): () => void {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
}

/** 声音的稳定标识。测试替身和个别浏览器没有 voiceURI，退回用名字 */
export function voiceId(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || voice.name;
}

function currentVoices(): SpeechSynthesisVoice[] {
  if (voices.length === 0 && speechSupported()) {
    try {
      voices = window.speechSynthesis.getVoices();
    } catch {
      voices = [];
    }
  }
  return voices;
}

/** 系统有没有报告任何声音。一个都没有时（加载中，或某些 WebView）不能断定缺哪种语言 */
export function voicesLoaded(): boolean {
  return currentVoices().length > 0;
}

/**
 * 某种语言可用的全部声音，按推荐顺序：先按 LANG_PREFERENCE 的地区顺序，
 * 同一地区里在线声音在前（Edge 的 Natural、Chrome 的 Google 声音通常比系统自带的自然）
 */
export function voicesFor(lang: string): SpeechSynthesisVoice[] {
  const prefs = LANG_PREFERENCE[lang] ?? [];
  const rank = (v: SpeechSynthesisVoice) => {
    const i = prefs.indexOf(v.lang.replace("_", "-"));
    // 地区 > 单语 > 在线 > 音质：多语言声音会自己猜语言，排到同口音的最后
    return (
      (i < 0 ? prefs.length : i) * 16 +
      (isMultilingual(v) ? 8 : 0) +
      (v.localService === false ? 0 : 4) +
      (3 - qualityRank(v))
    );
  };
  // 同一个声音被报两遍（voiceId 完全相同）才合并。名字相同、标识不同的不合并——
  // 那可能是不同音质的两个声音，由 voiceLabels() 附上标识区分
  const seen = new Set<string>();
  return currentVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(lang))
    .sort((a, b) => rank(a) - rank(b))
    .filter((v) => {
      const id = voiceId(v);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

/**
 * 苹果系统的同一个声音有几种音质，名字一样，只能从 voiceURI 看出来：
 * com.apple.voice.super-compact.en-US.Samantha（精简，最差）、…compact…（标准）、
 * …enhanced…（增强）、…premium…（高级）。iOS 上 super-compact 和 compact 会同时出现。
 */
const APPLE_QUALITIES = ["super-compact", "compact", "enhanced", "premium"];
const QUALITY_LABELS = ["精简", "标准", "增强", "高级"];

/** 音质档 0–3；看不出来的（非苹果声音）按标准算 */
function qualityRank(voice: SpeechSynthesisVoice): number {
  const id = `${voice.voiceURI} ${voice.name}`;
  if (/premium|高级/i.test(id)) return 3;
  if (/enhanced|增强|优化/i.test(id)) return 2;
  if (/super-compact/i.test(id)) return 0;
  return 1;
}

/** 要显示的音质。名字里已经写了 (Enhanced) 的不重复标；看不出音质的不标 */
function qualityLabel(voice: SpeechSynthesisVoice): string {
  if (/\((enhanced|premium|增强|高级|优化)\)/i.test(voice.name)) return "";
  const known =
    APPLE_QUALITIES.some((q) => voice.voiceURI.includes(`.${q}.`)) || /增强|高级/.test(voice.name);
  return known ? QUALITY_LABELS[qualityRank(voice)] : "";
}

/**
 * Edge 名字带 Multilingual 的在线声音（Vivienne、Remy 等）设计上就是自动识别文本语言，
 * 不认 utterance.lang：整句法语猜得准，table、grand 这种英法同形的单词常被判成英语。
 * 按名字里的通用标识判断，不按具体声音名列清单——清单只反映某台设备某次实测，会过时。
 */
export function isMultilingual(voice: SpeechSynthesisVoice): boolean {
  return /multilingual/i.test(voice.name);
}

/** 用户选过就用选的那个（还在的话），否则按推荐顺序取第一个 */
export function pickVoice(lang: string, preferred?: string): SpeechSynthesisVoice | undefined {
  const list = voicesFor(lang);
  return (preferred && list.find((v) => voiceId(v) === preferred)) || list[0];
}

/** 给人看的声音信息：名字、哪国口音、在线还是离线 */
export function describeVoice(voice: SpeechSynthesisVoice): {
  name: string;
  accent: string;
  online: boolean;
  /** 苹果系统声音的音质：精简 / 标准 / 增强 / 高级；看不出来的为空 */
  quality: string;
  /** 多语言声音的提醒，见 isMultilingual；其他声音为空 */
  warning: string;
} {
  const [base = "", region = ""] = voice.lang.split(/[-_]/);
  // 名字原样显示，不做简化：用户要靠完整名字分辨「Microsoft Sylvie Online (Natural)」这类声音
  const name = voice.name;
  const regionName = REGION_NAMES[region.toUpperCase()];
  return {
    name,
    accent: regionName ? regionName + langName(base.toLowerCase()) : voice.lang,
    // localService 为 false 是浏览器联网合成的声音，朗读的文字会发到它的服务器
    online: voice.localService === false,
    quality: qualityLabel(voice),
    warning: isMultilingual(voice) ? "多语言，可能误判语言" : "",
  };
}

/** 一行文字：「Microsoft Aria Online (Natural) - English (United States) · 美国英语 · 在线」 */
export function voiceLabel(voice: SpeechSynthesisVoice): string {
  const d = describeVoice(voice);
  return [d.name, d.accent, d.online ? "在线" : "离线", d.quality, d.warning]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 一组声音的显示文字。iOS 上会有名字、口音、音质都一样的两个 Amélie，
 * 光看文字分不出来，这时把完整的 voiceURI 附在后面，既能区分也方便排查。
 */
export function voiceLabels(list: SpeechSynthesisVoice[]): Map<string, string> {
  const base = new Map(list.map((v) => [voiceId(v), voiceLabel(v)]));
  const count = new Map<string, number>();
  for (const label of base.values()) count.set(label, (count.get(label) ?? 0) + 1);
  return new Map(
    [...base].map(([id, label]) => [id, (count.get(label) ?? 0) > 1 ? `${label} · ${id}` : label]),
  );
}

/** 没有目标语言声音时给用户的办法 */
export function missingVoiceMessage(lang: string): string {
  const name = langName(lang);
  // 推荐装首选口音的声音，Windows 语音设置里写作「英语（美国）」
  const [base = lang, region = ""] = (LANG_PREFERENCE[lang]?.[0] ?? lang).split("-");
  const regionName = REGION_NAMES[region.toUpperCase()] ?? "";
  const accent = regionName + langName(base);
  const winName = regionName ? `${name}（${regionName}）` : name;
  return (
    `这台设备没有${name}语音，用别的语言的声音会读错，所以没有朗读。` +
    `电脑上用 Edge 打开，自带${accent}在线语音；` +
    `iPhone 在「设置 → 辅助功能 → 朗读内容 → 声音」里下载「${winName}」声音；` +
    `Windows 可在「设置 → 时间和语言 → 语音」里添加「${winName}」，Edge 能用上，Chrome 不一定认。`
  );
}

/** 排查信息：能不能挑到声音、系统给了多少个声音 */
function diagnostics(lang: string, voice: SpeechSynthesisVoice | undefined): string {
  const list = voices.length === 0 ? "系统没报告任何声音" : `系统有 ${voices.length} 个声音`;
  const used = voice
    ? `${voice.name}（${voice.lang}，${voice.localService === false ? "在线" : "离线"}）`
    : "引擎默认声音";
  return `${list} · ${lang} 用的是 ${used}`;
}

type SpeakHandlers = {
  /** 语速，1 为引擎默认。不传用 DEFAULT_RATE */
  rate?: number;
  /** 用户选定的声音（voiceId）。不传或已经不在了就按推荐顺序挑 */
  voice?: string;
  /** 念完、或者出错收尾时都会调一次，用来复位「正在朗读」状态 */
  onSettled?: () => void;
  onError?: (failure: SpeechFailure) => void;
};

/** 朗读一段文本。lang 用 "en" / "fr" 这样的基础语言码 */
export function speak(text: string, lang: string, handlers: SpeakHandlers = {}): void {
  const { rate = DEFAULT_RATE, voice: preferred, onSettled, onError } = handlers;

  const fail = (failure: SpeechFailure) => {
    clearWatchdog();
    onError?.(failure);
    onSettled?.();
  };

  if (!speechSupported()) {
    fail({
      message: "这个浏览器不支持语音合成（Web Speech API），换 Safari 或 Edge 试试。",
      detail: typeof navigator === "undefined" ? undefined : navigator.userAgent,
    });
    return;
  }
  if (!text.trim()) {
    onSettled?.();
    return;
  }

  clearWatchdog();
  // iOS 上不先取消，第二次点击会没声音；但队列空的时候 cancel() 反而会弄僵引擎
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
  }

  const voice = pickVoice(lang, preferred);
  if (!voice && voicesLoaded()) {
    fail({ message: missingVoiceMessage(lang), detail: diagnostics(lang, voice) });
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? LANG_PREFERENCE[lang]?.[0] ?? lang;
  utterance.rate = rate;

  utterance.addEventListener("start", clearWatchdog);
  utterance.addEventListener("end", () => {
    clearWatchdog();
    onSettled?.();
  });
  utterance.addEventListener("error", (event) => {
    const code = (event as SpeechSynthesisErrorEvent).error ?? "unknown";
    if (BENIGN_ERRORS.has(code)) {
      clearWatchdog();
      onSettled?.();
      return;
    }
    fail({
      message: ERROR_MESSAGES[code] ?? `语音合成报错：${code}`,
      detail: `错误码 ${code} · ${diagnostics(lang, voice)}`,
    });
  });

  // 引擎收下了请求却不出声：iOS 上最常见的失败形态，既不报错也不播放。
  // 必须在 speak() 之前装好——有的实现会在 speak() 调用栈里就同步派发 start
  watchdog = setTimeout(() => {
    watchdog = undefined;
    onError?.({
      message:
        "浏览器接受了朗读请求，但一直没有出声。先看看手机侧边的静音拨片和媒体音量；" +
        "iOS 版 Chrome 对语音合成的支持一直不完整，换 Safari 或 Edge 一般就好了。",
      detail: diagnostics(lang, voice),
    });
    onSettled?.();
  }, START_TIMEOUT_MS);

  try {
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    fail({
      message: "调用语音合成时抛异常了。",
      detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
}

export function stopSpeaking(): void {
  clearWatchdog();
  if (speechSupported()) window.speechSynthesis.cancel();
}
