export type DeckId = "words" | "phrases";

export type Card = {
  id: string;
  section: string;
  theme: string;
  /** 卡片正面：英语词条 */
  front: string;
  pos: string;
  /** 音标。纯中文的语法卡没有 */
  ipa?: string;
  /** 释义，与 Deck.glossLabels 一一对应。目前两表都是 [中文] */
  glosses: string[];
  note: string;
  example: string;
};

export type DeckSection = {
  code: string;
  label: string;
  count: number;
};

export type Deck = {
  id: DeckId;
  name: string;
  subtitle: string;
  lang: string;
  glossLabels: string[];
  sections: DeckSection[];
  cards: Card[];
};

/** 背诵方向 */
export type Mode = "front-to-gloss" | "gloss-to-front";

/** 单张卡片的学习状态。字段名刻意短，因为要整体序列化进 localStorage */
export type CardStat = {
  /** 掌握等级 0..5，见 scheduler.ts 的 LEVEL_WEIGHTS */
  lv: number;
  /** 出现次数 */
  n: number;
  /** 答对次数 */
  ok: number;
  /** 答错次数 */
  bad: number;
  /** 连续答对次数 */
  streak: number;
  /** 上次出现时间，epoch ms */
  at: number;
  /** 上次是否答错，用于加权 */
  lastBad: boolean;
};

export type DeckProgress = {
  stats: Record<string, CardStat>;
};

export type Settings = {
  mode: Mode;
  /** 已选模块；空数组表示全选 */
  sections: string[];
  /** 是否把已掌握（lv 5）的卡片也放进抽取池 */
  includeMastered: boolean;
  /** 新词节流：同时最多放多少张没背过的卡进池子，0 表示不限 */
  newCardLimit: number;
  /** 翻面时自动朗读词条 */
  autoSpeak: boolean;
  /** 手动切换，默认浅色。v4 以前还有「跟随系统」，迁移时并入浅色 */
  theme: "light" | "dark";
  /** 朗读语速，传给 SpeechSynthesisUtterance.rate，1 为引擎默认语速 */
  speechRate: number;
  /** 每种语言选定的朗读声音（"en" → voiceId）。没选的按推荐顺序挑 */
  voices: Record<string, string>;
};

/** 选词表页用的轻量元信息，来自 public/data/index.json */
export type DeckSummary = {
  id: DeckId;
  name: string;
  subtitle: string;
  lang: string;
  count: number;
  sectionCount: number;
};

/**
 * 单日学习记录，按本地日期聚合，跨词表合并。
 *
 * 字段名同样刻意短——每天一条，两年就是七百多条，一起序列化进 localStorage。
 */
export type DayLog = {
  /** 学习时长，毫秒 */
  ms: number;
  /** 自评次数 */
  n: number;
  /** 答对次数 */
  ok: number;
  /** 学习词数。同一个词当天反复出现只算一次 */
  words: number;
  /** 其中此前从没背过的新词 */
  fresh: number;
  /** 当天升到「已掌握」的词数 */
  mastered: number;
};
