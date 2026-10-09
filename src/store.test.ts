// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { IDLE_GAP_MS, dayKey, emptyDay } from "@/lib/activity";
import { isMastered } from "@/lib/scheduler";
import { STORAGE_KEY, flushStorage } from "@/lib/storage";
import { DEFAULT_SETTINGS, useStore } from "@/store";
import type { Card, Deck } from "@/types";

function card(id: string, section = "A"): Card {
  return { id, section, theme: "t", front: id, pos: "n.", glosses: ["g"], note: "", example: "" };
}

const DECK: Deck = {
  id: "words",
  name: "测试词表",
  subtitle: "",
  lang: "en",
  glossLabels: ["中文"],
  sections: [
    { code: "A", label: "模块 A", count: 2 },
    { code: "B", label: "模块 B", count: 1 },
  ],
  cards: [card("a1", "A"), card("a2", "A"), card("b1", "B")],
};

function resetStore() {
  useStore.setState({
    progress: {
      words: { stats: {} },
      phrases: { stats: {} },
    },
    settings: { ...DEFAULT_SETTINGS },
    lastDeckId: null,
    deck: null,
    status: "idle",
    current: null,
    revealed: false,
    recent: [],
    session: { ok: 0, bad: 0 },
    daily: {},
    activeAt: null,
  });
}

beforeEach(async () => {
  resetStore();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(DECK)))),
  );
  await useStore.getState().openDeck("words");
});

describe("openDeck", () => {
  it("载入词表后立刻抽出第一张卡", () => {
    const s = useStore.getState();
    expect(s.status).toBe("ready");
    expect(s.deck?.cards).toHaveLength(3);
    expect(s.current).not.toBeNull();
    expect(s.revealed).toBe(false);
    expect(s.lastDeckId).toBe("words");
  });

  it("请求失败时进入 error 状态而不是崩溃", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
    );
    await useStore.getState().openDeck("words");
    expect(useStore.getState().status).toBe("error");
  });
});

describe("answer", () => {
  it("记录自评结果、累计本次战绩并自动翻到下一张", () => {
    const first = useStore.getState().current!;
    useStore.getState().reveal();
    useStore.getState().answer(true);

    const s = useStore.getState();
    expect(s.progress.words.stats[first.id]).toMatchObject({ lv: 1, n: 1, ok: 1 });
    expect(s.session).toEqual({ ok: 1, bad: 0 });
    expect(s.revealed).toBe(false);
    expect(s.current).not.toBeNull();
  });

  it("答错会降级并计入错误数", () => {
    const first = useStore.getState().current!;
    useStore.setState((s) => ({
      progress: {
        ...s.progress,
        words: {
          stats: {
            [first.id]: {
              ...s.progress.words.stats[first.id],
              lv: 3,
              n: 4,
              ok: 4,
              bad: 0,
              streak: 4,
              at: Date.now(),
              lastBad: false,
            },
          },
        },
      },
    }));
    useStore.getState().answer(false);

    expect(useStore.getState().progress.words.stats[first.id]).toMatchObject({
      lv: 1,
      bad: 1,
      lastBad: true,
    });
    expect(useStore.getState().session).toEqual({ ok: 0, bad: 1 });
  });

  it("连续答对足以把一张卡推到已掌握", () => {
    const target = "a1";
    for (let i = 0; i < 5; i++) {
      // 直接指定当前卡，避免依赖随机抽取顺序
      useStore.setState({ current: card(target) });
      useStore.getState().answer(true);
    }
    expect(isMastered(useStore.getState().progress.words.stats[target])).toBe(true);
  });

  it("没有当前卡时调用不会抛错", () => {
    useStore.setState({ current: null });
    expect(() => useStore.getState().answer(true)).not.toThrow();
  });
});

describe("筛选与重置", () => {
  it("只选某个模块后，抽出的卡都属于该模块", () => {
    useStore.getState().updateSettings({ sections: ["B"] });
    for (let i = 0; i < 10; i++) {
      expect(useStore.getState().current?.section).toBe("B");
      useStore.getState().drawNext();
    }
  });

  it("模块全不选时抽不出卡，界面据此显示空状态", () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, sections: ["A"] } });
    useStore.getState().updateSettings({ sections: ["ZZZ"] });
    expect(useStore.getState().current).toBeNull();
  });

  it("重置清空该词表进度并重新抽卡", () => {
    useStore.getState().answer(true);
    expect(Object.keys(useStore.getState().progress.words.stats)).toHaveLength(1);

    useStore.getState().resetDeck("words");
    expect(useStore.getState().progress.words.stats).toEqual({});
    expect(useStore.getState().current).not.toBeNull();
  });
});

describe("连续作答", () => {
  it("短时间内不会重复抽到同一张卡", () => {
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(useStore.getState().current!.id);
      useStore.getState().answer(true);
    }
    expect(new Set(seen).size).toBe(3);
  });
});

describe("打卡日志", () => {
  const today = () => useStore.getState().daily[dayKey(Date.now())] ?? emptyDay();

  it("自评一次记一次，同时算作学过一个新词", () => {
    useStore.getState().answer(true);
    expect(today()).toMatchObject({ n: 1, ok: 1, words: 1, fresh: 1 });
  });

  it("同一个词当天反复出现，学习词数只算一次", () => {
    useStore.setState({ current: card("a1") });
    useStore.getState().answer(true);
    useStore.setState({ current: card("a1") });
    useStore.getState().answer(false);

    expect(today()).toMatchObject({ n: 2, ok: 1, words: 1, fresh: 1 });
  });

  it("升到已掌握记一次，之后再答对不重复记", () => {
    for (let i = 0; i < 7; i++) {
      useStore.setState({ current: card("a1") });
      useStore.getState().answer(true);
    }
    expect(today().mastered).toBe(1);
  });

  it("两次操作之间的间隔计入学习时长", () => {
    useStore.setState({ activeAt: Date.now() - 5_000 });
    useStore.getState().tickActivity();

    expect(today().ms).toBeGreaterThanOrEqual(5_000);
    expect(today().ms).toBeLessThan(6_000);
  });

  it("间隔过长视作中途走开，整段不计入但重新开表", () => {
    useStore.setState({ activeAt: Date.now() - IDLE_GAP_MS - 1_000 });
    useStore.getState().tickActivity();

    expect(today().ms).toBe(0);
    expect(useStore.getState().activeAt).not.toBeNull();
  });

  it("离开词表与切后台都停表", () => {
    useStore.getState().pauseActivity();
    expect(useStore.getState().activeAt).toBeNull();

    useStore.getState().leaveDeck();
    expect(useStore.getState().activeAt).toBeNull();
  });

  it("重置单个词表的进度不会抹掉打卡日志——日志是跨词表的", () => {
    useStore.getState().answer(true);
    useStore.getState().resetDeck("words");
    expect(today().n).toBe(1);
  });
});

describe("存档迁移", () => {
  async function hydrateFrom(state: unknown, version: number) {
    flushStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version }));
    await useStore.persist.rehydrate();
  }

  it("v2 存档升级时把自动朗读打开", async () => {
    await hydrateFrom({ settings: { ...DEFAULT_SETTINGS, autoSpeak: false } }, 2);
    expect(useStore.getState().settings.autoSpeak).toBe(true);
  });

  it("v3 存档升级时「跟随系统」改成浅色，明确选了深色的保留", async () => {
    await hydrateFrom({ settings: { ...DEFAULT_SETTINGS, theme: "system" } }, 3);
    expect(useStore.getState().settings.theme).toBe("light");

    await hydrateFrom({ settings: { ...DEFAULT_SETTINGS, theme: "dark" } }, 3);
    expect(useStore.getState().settings.theme).toBe("dark");
  });

  it("旧存档没有语速字段时用默认语速", async () => {
    const { speechRate: _, ...old } = DEFAULT_SETTINGS;
    await hydrateFrom({ settings: old }, 3);
    expect(useStore.getState().settings.speechRate).toBe(DEFAULT_SETTINGS.speechRate);
  });

  it("v4 存档里没动过的默认语速「慢」改成新默认「很慢」，主动选的保留", async () => {
    await hydrateFrom({ settings: { ...DEFAULT_SETTINGS, speechRate: 0.7 } }, 4);
    expect(useStore.getState().settings.speechRate).toBe(0.5);

    await hydrateFrom({ settings: { ...DEFAULT_SETTINGS, speechRate: 1 } }, 4);
    expect(useStore.getState().settings.speechRate).toBe(1);
  });

  it("v5 存档升级：已掌握的词默认也出现，新词节流的旧默认 20 改成 50", async () => {
    await hydrateFrom(
      { settings: { ...DEFAULT_SETTINGS, includeMastered: false, newCardLimit: 20 } },
      5,
    );
    expect(useStore.getState().settings).toMatchObject({ includeMastered: true, newCardLimit: 50 });

    // 主动选过的节流值不动
    await hydrateFrom({ settings: { ...DEFAULT_SETTINGS, newCardLimit: 10 } }, 5);
    expect(useStore.getState().settings.newCardLimit).toBe(10);
  });
});
