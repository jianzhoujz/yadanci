import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { IDLE_GAP_MS, addDay, dayKey, emptyDay, pruneDaily } from "@/lib/activity";
import { applyAnswer, candidates, emptyStat, isMastered, isNew, pickNext } from "@/lib/scheduler";
import { STORAGE_KEY, throttledStorage } from "@/lib/storage";
import type { Card, CardStat, DayLog, Deck, DeckId, DeckProgress, Settings } from "@/types";

export const DECK_IDS = ["words", "phrases"] as const;

export const DEFAULT_SETTINGS: Settings = {
  mode: "front-to-gloss",
  sections: [],
  includeMastered: true,
  newCardLimit: 50,
  autoSpeak: true,
  theme: "light",
  speechRate: 0.5,
  voices: {},
};

/** 朗读语速档位。各家引擎对同一个 rate 的实际快慢不一样，所以只给相对档位 */
export const SPEECH_RATES = [
  { value: 0.5, label: "很慢" },
  { value: 0.7, label: "慢" },
  { value: 0.85, label: "适中" },
  { value: 1, label: "正常" },
] as const;

const emptyProgress = (): Record<DeckId, DeckProgress> => ({
  words: { stats: {} },
  phrases: { stats: {} },
});

type Persisted = {
  progress: Record<DeckId, DeckProgress>;
  /** 按本地日期聚合的打卡日志，跨词表合并 */
  daily: Record<string, DayLog>;
  settings: Settings;
  lastDeckId: DeckId | null;
};

type Transient = {
  deck: Deck | null;
  status: "idle" | "loading" | "ready" | "error";
  current: Card | null;
  revealed: boolean;
  /** 最近出现过的卡片 id，最新的在末尾 */
  recent: string[];
  session: { ok: number; bad: number };
  /** 学习时长的计时起点；null 表示当前没在背（页面切后台或已退出词表） */
  activeAt: number | null;
};

type Actions = {
  openDeck: (id: DeckId) => Promise<void>;
  leaveDeck: () => void;
  reveal: () => void;
  answer: (correct: boolean) => void;
  drawNext: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetDeck: (id: DeckId) => void;
  resetDaily: () => void;
  statOf: (cardId: string) => CardStat;
  tickActivity: () => void;
  pauseActivity: () => void;
};

export type Store = Persisted & Transient & Actions;

/** 依据当前词库、进度与设置抽下一张卡 */
function draw(state: Store): Card | null {
  if (!state.deck) return null;
  const stats = state.progress[state.deck.id].stats;
  const pool = candidates(state.deck.cards, stats, state.settings);
  return pickNext(pool, stats, state.recent, Date.now());
}

function bump(
  daily: Record<string, DayLog>,
  key: string,
  patch: Partial<DayLog>,
): Record<string, DayLog> {
  return { ...daily, [key]: addDay(daily[key] ?? emptyDay(), patch) };
}

/**
 * 把上次活动到 `now` 之间的时间计入当天，并把计时起点推到 `now`。
 *
 * 学习时长靠「操作之间的间隔」累加，而不是从进入词表到退出的墙上时间——
 * 后者会把中途接个电话、切去微信的半小时全算成学习。间隔超过
 * `IDLE_GAP_MS` 就整段丢掉，只重置起点。背诵页有个心跳定时器定期调用它，
 * 所以正常翻卡时每段间隔都远小于这个上限。
 */
function touch(s: Store, now: number): Pick<Store, "daily" | "activeAt"> {
  const gap = s.activeAt === null ? 0 : now - s.activeAt;
  const daily = gap > 0 && gap <= IDLE_GAP_MS ? bump(s.daily, dayKey(now), { ms: gap }) : s.daily;
  return { daily, activeAt: now };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      progress: emptyProgress(),
      daily: {},
      settings: DEFAULT_SETTINGS,
      lastDeckId: null,

      deck: null,
      status: "idle",
      current: null,
      revealed: false,
      recent: [],
      session: { ok: 0, bad: 0 },
      activeAt: null,

      statOf: (cardId) => get().progress[get().deck?.id ?? "words"].stats[cardId] ?? emptyStat(),

      openDeck: async (id) => {
        set({ status: "loading", deck: null, current: null, revealed: false });
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data/${id}.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const deck = (await res.json()) as Deck;
          set({
            deck,
            status: "ready",
            lastDeckId: id,
            recent: [],
            session: { ok: 0, bad: 0 },
            revealed: false,
            activeAt: Date.now(),
          });
          get().drawNext();
        } catch {
          set({ status: "error", activeAt: null });
        }
      },

      leaveDeck: () =>
        set((s) => ({
          ...touch(s, Date.now()),
          activeAt: null,
          deck: null,
          status: "idle",
          current: null,
          revealed: false,
          recent: [],
        })),

      reveal: () => set((s) => ({ ...touch(s, Date.now()), revealed: true })),

      drawNext: () => set((s) => ({ current: draw(s), revealed: false })),

      tickActivity: () => set((s) => touch(s, Date.now())),

      pauseActivity: () => set((s) => ({ ...touch(s, Date.now()), activeAt: null })),

      answer: (correct) => {
        const { deck, current } = get();
        if (!deck || !current) return;

        set((s) => {
          const now = Date.now();
          const deckId = deck.id;
          const stats = s.progress[deckId].stats;
          const prev = stats[current.id];
          const next = applyAnswer(prev, correct, now);

          // 同一个词当天反复出现只算一次「学习词数」，靠上次出现时间判断
          const already = prev !== undefined && prev.n > 0 && dayKey(prev.at) === dayKey(now);
          const ticked = touch(s, now);

          const updated: Store = {
            ...s,
            ...ticked,
            daily: bump(ticked.daily, dayKey(now), {
              n: 1,
              ok: correct ? 1 : 0,
              words: already ? 0 : 1,
              fresh: isNew(prev) ? 1 : 0,
              // 只记「升上去」这个事件，之后答错掉级不回撤——当天确实掌握过
              mastered: isMastered(next) && !isMastered(prev) ? 1 : 0,
            }),
            progress: {
              ...s.progress,
              [deckId]: { stats: { ...stats, [current.id]: next } },
            },
            recent: [...s.recent, current.id].slice(-64),
            session: {
              ok: s.session.ok + (correct ? 1 : 0),
              bad: s.session.bad + (correct ? 0 : 1),
            },
          };

          return { ...updated, current: draw(updated), revealed: false };
        });
      },

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        // 筛选条件变了，当前这张卡可能已不在池中，直接换一张
        if ("sections" in patch || "includeMastered" in patch || "newCardLimit" in patch) {
          get().drawNext();
        }
      },

      resetDeck: (id) => {
        // 打卡日志是跨词表的，重置单个词表不动它
        set((s) => ({
          progress: { ...s.progress, [id]: { stats: {} } },
          recent: [],
          session: { ok: 0, bad: 0 },
        }));
        if (get().deck?.id === id) get().drawNext();
      },

      resetDaily: () => set({ daily: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => throttledStorage),
      version: 6,
      partialize: (s): Persisted => ({
        progress: s.progress,
        daily: s.daily,
        settings: s.settings,
        lastDeckId: s.lastDeckId,
      }),
      migrate: (persisted, version) => {
        const p = { ...(persisted as Record<string, unknown>) };
        if (version < 3 && p.settings) {
          // v3 起自动朗读默认打开。旧默认是关，存档里的 false 几乎都是没动过的默认值，一并翻成开
          p.settings = { ...(p.settings as Settings), autoSpeak: true };
        }
        if (version < 4 && p.settings) {
          // v4 起主题改为手动切换、默认浅色。「跟随系统」一律落到浅色，只保留明确选了深色的
          const settings = p.settings as Settings & { theme: string };
          p.settings = { ...settings, theme: settings.theme === "dark" ? "dark" : "light" };
        }
        if (version < 5 && p.settings) {
          // v5 起默认语速从「慢」(0.7) 改成「很慢」(0.5)。0.7 是 v4 的默认值、上线才几小时，
          // 存档里的 0.7 几乎都是没动过的默认值，一并改掉；主动选了别的档位的不动
          const settings = p.settings as Settings;
          if (settings.speechRate === 0.7) p.settings = { ...settings, speechRate: 0.5 };
        }
        if (version < 6 && p.settings) {
          // v6 起默认让已掌握的词也出现、新词节流放宽到 50。存档里的旧默认值（不出现 / 20）
          // 几乎都是没动过的，一并改成新默认；主动选了别的值的不动
          const settings = p.settings as Settings;
          p.settings = {
            ...settings,
            includeMastered: true,
            newCardLimit: settings.newCardLimit === 20 ? 50 : settings.newCardLimit,
          };
        }
        return p as Persisted;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Persisted>;
        return {
          ...current,
          ...p,
          // 旧存档可能缺字段，用默认值补齐，避免升级后炸在 undefined 上
          progress: { ...emptyProgress(), ...p.progress },
          daily: pruneDaily(p.daily ?? {}, Date.now()),
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
          lastDeckId: (DECK_IDS as readonly string[]).includes(p.lastDeckId ?? "")
            ? (p.lastDeckId as DeckId)
            : null,
        };
      },
    },
  ),
);
