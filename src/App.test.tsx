// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import App from "@/App";
import { dayKey } from "@/lib/activity";
import { DEFAULT_SETTINGS, useStore } from "@/store";
import type { Card, Deck } from "@/types";

/**
 * 界面层的端到端冒烟测试：渲染整棵组件树并真的点按钮，
 * 覆盖「翻面 → 自评 → 进度落库 → 自动换卡」这条主链路。
 */
function card(id: string, front: string, gloss: string, ipa?: string): Card {
  return {
    id,
    ...(ipa ? { ipa } : {}),
    section: "EMAIL",
    theme: "开头-称呼",
    front,
    pos: "chunk",
    glosses: [gloss],
    note: "正式邮件唯一安全开头",
    example: "Dear Ms. Carter,",
  };
}

const DECK: Deck = {
  id: "phrases",
  name: "短语",
  subtitle: "英语 · 搭配、短语与整句",
  lang: "en",
  glossLabels: ["中文"],
  sections: [{ code: "EMAIL", label: "Write Email 功能语块", count: 2 }],
  cards: [
    card("c1", "Dear Mr./Ms. + 姓", "尊敬的……先生/女士"),
    card("c2", "To whom it may concern", "敬启者"),
    card("c3", "invoice", "发票", "/ˈɪnvɔɪs/"),
  ],
};

function seed(patch: Partial<ReturnType<typeof useStore.getState>> = {}) {
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
    ...patch,
  });
}

/** happy-dom 没有 canvas，出图得自己顶上，否则分享按钮一直是禁用的 */
function stubCanvas() {
  const gradient = { addColorStop: () => {} };
  const ctx = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 120 }),
    fillRect: () => {},
    fillText: () => {},
    beginPath: () => {},
    moveTo: () => {},
    arcTo: () => {},
    arc: () => {},
    closePath: () => {},
    fill: () => {},
    font: "",
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => {
    cb(new Blob(["png"], { type: "image/png" }));
  });
}

/** navigator 上的属性是只读的，只能这样换掉 */
function define(key: "share" | "canShare", value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true });
}

/** Radix 的下拉菜单在 pointerdown 时打开，不是 click */
async function openMenuItem(name: string) {
  // 上一次的菜单还在退场动画里时，点到的是那个正在关的菜单，选了不生效
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  fireEvent.pointerDown(screen.getByRole("button", { name: "菜单" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

const studying = (current: Card) => ({
  deck: DECK,
  status: "ready" as const,
  current,
  revealed: false,
});

beforeEach(() => {
  seed();
  // 选词表页开屏会拉 data/index.json，测试里没有静态服务器，直接桩掉
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify([])))),
  );
});
afterEach(() => {
  cleanup();
  // 速查页的路由在 hash 上，别漏到下一个测试
  window.history.replaceState(null, "", window.location.pathname);
});

describe("选词表页", () => {
  it("渲染标题与引导语", () => {
    render(<App />);
    expect(screen.getByText("牙！单词")).toBeTruthy();
    expect(screen.getByText("选一个词表开始")).toBeTruthy();
  });

  it("词表列表下方给出今日数据与分享入口", async () => {
    seed({
      daily: {
        [dayKey(Date.now())]: { ms: 65_000, n: 4, ok: 3, words: 3, fresh: 2, mastered: 1 },
      },
    });
    render(<App />);

    // 统计模块要等词表清单拉回来才渲染
    expect(await screen.findByText("学习统计")).toBeTruthy();
    expect(screen.getByText("1 分钟")).toBeTruthy();
    expect(screen.getByText(/今日自评/).textContent).toContain("正确率 75%");
    expect(screen.getByRole("button", { name: /分享/ })).toBeTruthy();
  });

  it("周月年三个区间都能切，柱子数量跟着变", async () => {
    render(<App />);
    await screen.findByText("学习统计");

    expect(screen.getAllByRole("button", { name: /学习 \d+ 词/ })).toHaveLength(7);

    fireEvent.click(screen.getByRole("radio", { name: "月" }));
    expect(screen.getAllByRole("button", { name: /学习 \d+ 词/ })).toHaveLength(30);

    fireEvent.click(screen.getByRole("radio", { name: "年" }));
    expect(screen.getAllByRole("button", { name: /学习 \d+ 词/ })).toHaveLength(12);
  });

  it("点柱子把那一天的数字顶到图上方", async () => {
    const key = dayKey(Date.now());
    seed({ daily: { [key]: { ms: 65_000, n: 4, ok: 3, words: 3, fresh: 2, mastered: 1 } } });
    render(<App />);
    await screen.findByText("学习统计");

    const bars = screen.getAllByRole("button", { name: /学习 \d+ 词/ });
    fireEvent.click(bars[bars.length - 1]);

    // 默认显示整个区间的合计，选中后换成这一天
    expect(screen.getByText(/学习 3 词 · 1 分钟/)).toBeTruthy();
  });

  it("点分享给出预览对话框", async () => {
    render(<App />);
    await screen.findByText("学习统计");
    fireEvent.click(screen.getByRole("button", { name: /分享/ }));

    // 对话框只有标题、预览图和两个按钮，没有多余文案
    expect(await screen.findByRole("button", { name: /保存图片/ })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "分享" })).toBeTruthy();
  });

  it("分享只把图片交给系统面板，不带任何文字", async () => {
    stubCanvas();
    const calls: ShareData[] = [];
    define("canShare", () => true);
    define("share", (data: ShareData) => {
      calls.push(data);
      return Promise.resolve();
    });

    render(<App />);
    await screen.findByText("学习统计");
    fireEvent.click(screen.getByRole("button", { name: /分享/ }));

    const dialog = await screen.findByRole("dialog");
    const button = within(dialog).getByRole("button", { name: /分享/ }) as HTMLButtonElement;
    // 图是异步画的，画完按钮才可用
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0].files?.[0].type).toBe("image/png");
    // 带上 text 或 title，微信就只发那段文字，图片会被丢掉
    expect(calls[0].text).toBeUndefined();
    expect(calls[0].title).toBeUndefined();

    vi.restoreAllMocks();
  });
});

describe("深浅色", () => {
  afterEach(() => document.documentElement.classList.remove("dark"));

  it("默认浅色，右上角按钮切到深色并记住", () => {
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "切换到深色模式" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useStore.getState().settings.theme).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "切换到浅色模式" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("系统是深色时也不自动变深", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) => ({ matches: true, media: query }) as MediaQueryList,
    );
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("背诵页", () => {
  it("未翻面时只给题面，不泄露答案", () => {
    seed(studying(DECK.cards[0]));
    render(<App />);

    expect(screen.getByText("Dear Mr./Ms. + 姓")).toBeTruthy();
    expect(screen.getByRole("button", { name: "看答案" })).toBeTruthy();
    expect(screen.queryByText("尊敬的……先生/女士")).toBeNull();
  });

  it("点「看答案」后给出释义、用法要点和例句", () => {
    seed(studying(DECK.cards[0]));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "看答案" }));

    expect(screen.getByText("尊敬的……先生/女士")).toBeTruthy();
    expect(screen.getByText("正式邮件唯一安全开头")).toBeTruthy();
    expect(screen.getByText("Dear Ms. Carter,")).toBeTruthy();
  });

  it("点卡片本身也能翻面", () => {
    seed(studying(DECK.cards[0]));
    render(<App />);
    fireEvent.click(screen.getByText("Dear Mr./Ms. + 姓"));
    expect(screen.getByText("尊敬的……先生/女士")).toBeTruthy();
  });

  it("自评「记住了」会写入进度、累计战绩并换下一张", () => {
    seed(studying(DECK.cards[0]));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "看答案" }));
    fireEvent.click(screen.getByRole("button", { name: /记住了/ }));

    const s = useStore.getState();
    expect(s.progress.phrases.stats["c1"]).toMatchObject({ lv: 1, ok: 1 });
    expect(s.session).toEqual({ ok: 1, bad: 0 });
    expect(s.revealed).toBe(false);
    expect(screen.getByRole("button", { name: "看答案" })).toBeTruthy();
  });

  it("自评「没记住」计入错误并标记 lastBad", () => {
    seed(studying(DECK.cards[0]));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "看答案" }));
    fireEvent.click(screen.getByRole("button", { name: /没记住/ }));

    expect(useStore.getState().progress.phrases.stats["c1"]).toMatchObject({
      bad: 1,
      lastBad: true,
    });
    expect(useStore.getState().session).toEqual({ ok: 0, bad: 1 });
  });

  it("键盘：空格翻面，→ 判对，← 判错", () => {
    seed(studying(DECK.cards[0]));
    render(<App />);

    fireEvent.keyDown(window, { key: " " });
    expect(useStore.getState().revealed).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useStore.getState().session).toEqual({ ok: 1, bad: 0 });

    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(useStore.getState().session).toEqual({ ok: 1, bad: 1 });
  });

  it("没翻面时按判定键不计分，避免手滑打分", () => {
    seed(studying(DECK.cards[0]));
    render(<App />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useStore.getState().session).toEqual({ ok: 0, bad: 0 });
    expect(useStore.getState().revealed).toBe(false);
  });

  it("切到「看义猜词」后题面变成释义，且不泄露词条", () => {
    seed(studying(DECK.cards[1]));
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: "看义猜词" }));

    expect(screen.getByText("敬启者")).toBeTruthy();
    expect(screen.queryByText("To whom it may concern")).toBeNull();
  });

  it("右上角菜单分别打开学习进度和设置，两者不再挤在一个弹窗里", async () => {
    seed(studying(DECK.cards[0]));
    render(<App />);

    await openMenuItem("学习进度");
    const progress = await screen.findByRole("dialog", { name: /学习进度/ });
    expect(within(progress).getByText(/重置 短语 的进度/)).toBeTruthy();
    expect(within(progress).queryByText("朗读语速")).toBeNull();
    fireEvent.keyDown(progress, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openMenuItem("设置");
    const settings = await screen.findByRole("dialog", { name: "设置" });
    expect(within(settings).getByText("朗读语速")).toBeTruthy();
    expect(within(settings).queryByText(/重置/)).toBeNull();

    fireEvent.click(within(settings).getByRole("radio", { name: "正常" }));
    expect(useStore.getState().settings.speechRate).toBe(1);
  });

  it("菜单里能切深色模式", async () => {
    seed(studying(DECK.cards[0]));
    render(<App />);

    await openMenuItem("深色模式");
    expect(useStore.getState().settings.theme).toBe("dark");
    await openMenuItem("浅色模式");
    expect(useStore.getState().settings.theme).toBe("light");
  });

  it("抽不出卡时显示空状态而不是白屏", () => {
    seed({ deck: DECK, status: "ready", current: null });
    render(<App />);
    expect(screen.getByText(/没有可背的词/)).toBeTruthy();
  });

  it("词表加载失败时给出返回入口", () => {
    seed({ deck: null, status: "error" });
    render(<App />);
    expect(screen.getByText("词表加载失败。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(useStore.getState().status).toBe("idle");
  });
});

describe("音标与朗读", () => {
  const spoken: string[] = [];

  /** 最后一次 speak 的 utterance，测试靠它手动触发 start/end/error */
  let lastUtterance: FakeUtterance | null = null;

  class FakeUtterance {
    text: string;
    lang = "";
    rate = 1;
    voice: unknown = null;
    private listeners: Record<string, ((e: unknown) => void)[]> = {};
    constructor(text: string) {
      this.text = text;
    }
    addEventListener(type: string, fn: (e: unknown) => void) {
      (this.listeners[type] ??= []).push(fn);
    }
    emit(type: string, event: unknown = {}) {
      for (const fn of this.listeners[type] ?? []) fn(event);
    }
  }

  /** 模仿 Edge：一个在线的美国英语声音、一个离线的英国英语声音，外加系统默认的中文声音 */
  const VOICES = [
    {
      lang: "en-US",
      name: "Microsoft Aria Online (Natural) - English (United States)",
      voiceURI: "en-aria",
      localService: false,
    },
    {
      lang: "en-GB",
      name: "Microsoft George - English (United Kingdom)",
      voiceURI: "en-george",
      localService: true,
    },
    {
      lang: "zh-CN",
      name: "Microsoft Huihui - Chinese (Simplified, PRC)",
      voiceURI: "zh-huihui",
      localService: true,
    },
  ];

  function stubSpeech(speak?: (u: FakeUtterance) => void, voices = VOICES) {
    spoken.length = 0;
    lastUtterance = null;
    vi.stubGlobal("speechSynthesis", {
      speaking: false,
      pending: false,
      getVoices: () => voices,
      speak: (u: FakeUtterance) => {
        lastUtterance = u;
        spoken.push(u.text);
        speak?.(u);
      },
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  }

  /** 关掉自动朗读，只看手动点喇叭的效果 */
  const manual = () => ({
    ...studying(DECK.cards[2]),
    settings: { ...DEFAULT_SETTINGS, autoSpeak: false },
  });

  it("有音标的词条会把音标显示出来", () => {
    seed(studying(DECK.cards[2]));
    render(<App />);
    expect(screen.getByText("/ˈɪnvɔɪs/")).toBeTruthy();
  });

  it("看义猜词模式下，翻面前不显示音标——那等于泄露读音", () => {
    seed({
      ...studying(DECK.cards[2]),
      settings: { ...DEFAULT_SETTINGS, mode: "gloss-to-front" },
    });
    render(<App />);

    expect(screen.queryByText("/ˈɪnvɔɪs/")).toBeNull();
    expect(screen.queryByRole("button", { name: "朗读" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "看答案" }));
    expect(screen.getByText("/ˈɪnvɔɪs/")).toBeTruthy();
  });

  it("点喇叭朗读词条，翻面后还能单独朗读例句", () => {
    stubSpeech();
    seed(manual());
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    expect(spoken).toEqual(["invoice"]);

    fireEvent.click(screen.getByRole("button", { name: "看答案" }));
    fireEvent.click(screen.getByRole("button", { name: "朗读例句" }));
    expect(spoken).toEqual(["invoice", "Dear Ms. Carter,"]);
  });

  it("朗读用设置里的语速", () => {
    stubSpeech();
    seed({ ...manual(), settings: { ...DEFAULT_SETTINGS, autoSpeak: false, speechRate: 0.85 } });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    expect(lastUtterance!.rate).toBe(0.85);
  });

  it("浏览器不支持语音合成时不渲染朗读按钮", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    seed(manual());
    render(<App />);
    expect(screen.queryByRole("button", { name: "朗读" })).toBeNull();
  });

  it("看词猜义时一换到新词就自动读，翻面不再重读", () => {
    stubSpeech();
    seed(studying(DECK.cards[2]));
    render(<App />);

    expect(spoken).toEqual(["invoice"]);
    fireEvent.click(screen.getByRole("button", { name: "看答案" }));
    expect(spoken).toEqual(["invoice"]);
  });

  it("看义猜词时词条是答案，翻面后才自动读", () => {
    stubSpeech();
    seed({
      ...studying(DECK.cards[2]),
      settings: { ...DEFAULT_SETTINGS, mode: "gloss-to-front" },
    });
    render(<App />);

    expect(spoken).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "看答案" }));
    expect(spoken).toEqual(["invoice"]);
  });

  it("关掉自动朗读就不自己出声", () => {
    stubSpeech();
    seed(manual());
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "看答案" }));
    expect(spoken).toEqual([]);
  });

  it("自动朗读失败不弹气泡，手动点喇叭才报", () => {
    stubSpeech();
    seed(studying(DECK.cards[2]));
    render(<App />);

    act(() => lastUtterance!.emit("error", { error: "not-allowed" }));
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    act(() => lastUtterance!.emit("error", { error: "not-allowed" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("引擎报错时把错误摆到气泡里，而不是默默什么都不发生", () => {
    stubSpeech();
    seed(manual());
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    act(() => lastUtterance!.emit("error", { error: "synthesis-failed" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("语音合成引擎处理这段文本时失败了");

    // 详情里带错误码，远程排查时能直接问用户气泡上写了什么
    fireEvent.click(screen.getByText("详情"));
    expect(screen.getByRole("alert").textContent).toContain("synthesis-failed");

    fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("我们自己 cancel 造成的打断不算错误，不弹气泡", () => {
    stubSpeech();
    seed(manual());
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    act(() => lastUtterance!.emit("error", { error: "interrupted" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("speak() 收下了请求却迟迟不出声，超时后也要报出来", () => {
    vi.useFakeTimers();
    try {
      // speak 不抛错也不触发任何事件：iOS 上最常见的静默失败
      stubSpeech();
      seed(manual());
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "朗读" }));
      expect(screen.queryByRole("alert")).toBeNull();

      act(() => void vi.advanceTimersByTime(2000));
      expect(screen.getByRole("alert").textContent).toContain("一直没有出声");
    } finally {
      vi.useRealTimers();
    }
  });

  it("正常开播就不该再报超时", () => {
    vi.useFakeTimers();
    try {
      stubSpeech((u) => u.emit("start"));
      seed(manual());
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "朗读" }));
      act(() => void vi.advanceTimersByTime(5000));
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("卡片上摆出当前朗读用的声音：名字、口音、在线还是离线", () => {
    stubSpeech();
    seed(manual());
    render(<App />);

    // 按 en-US 优先，同地区在线的在前；名字原样显示
    expect(
      screen.getByText(
        "Microsoft Aria Online (Natural) - English (United States) · 美国英语 · 在线",
        {
          selector: "span",
        },
      ),
    ).toBeTruthy();
  });

  it("换了声音，下一次朗读就用新声音，并记进设置", () => {
    stubSpeech();
    seed(manual());
    render(<App />);

    fireEvent.change(screen.getByLabelText("英语朗读声音"), { target: { value: "en-george" } });
    expect(useStore.getState().settings.voices.en).toBe("en-george");
    expect(
      screen.getByText("Microsoft George - English (United Kingdom) · 英国英语 · 离线", {
        selector: "span",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    expect((lastUtterance!.voice as { voiceURI: string }).voiceURI).toBe("en-george");
  });

  it("iOS 同一个声音的几种音质标成中文，好的排前面；真重复的只列一次", () => {
    const samantha = (voiceURI: string) => ({
      lang: "en-US",
      name: "Samantha",
      voiceURI,
      localService: true,
    });
    stubSpeech(undefined, [
      samantha("com.apple.voice.super-compact.en-US.Samantha"),
      samantha("com.apple.voice.compact.en-US.Samantha"),
      samantha("com.apple.voice.compact.en-US.Samantha"),
      samantha("com.apple.voice.enhanced.en-US.Samantha"),
      {
        lang: "en-GB",
        name: "Daniel",
        voiceURI: "com.apple.voice.compact.en-GB.Daniel",
        localService: true,
      },
    ]);
    seed(manual());
    render(<App />);

    const options = [...(screen.getByLabelText("英语朗读声音") as HTMLSelectElement).options];
    expect(options.map((o) => o.text)).toEqual([
      "Samantha · 美国英语 · 离线 · 增强",
      "Samantha · 美国英语 · 离线 · 标准",
      "Samantha · 美国英语 · 离线 · 精简",
      "Daniel · 英国英语 · 离线 · 标准",
    ]);
  });

  it("同名同音质、标识不同的两个声音附上标识区分", () => {
    const samantha = (voiceURI: string) => ({
      lang: "en-US",
      name: "Samantha",
      voiceURI,
      localService: true,
    });
    stubSpeech(undefined, [samantha("samantha-a"), samantha("samantha-b")]);
    seed(manual());
    render(<App />);

    const options = [...(screen.getByLabelText("英语朗读声音") as HTMLSelectElement).options];
    expect(options.map((o) => o.text)).toEqual([
      "Samantha · 美国英语 · 离线 · samantha-a",
      "Samantha · 美国英语 · 离线 · samantha-b",
    ]);
  });

  it("Edge 的多语言声音排到同口音最后并标出提醒，朗读时 lang 跟声音一致", () => {
    stubSpeech(undefined, [
      {
        lang: "en-US",
        name: "Microsoft Andrew Multilingual Online (Natural) - English (United States)",
        voiceURI: "andrew",
        localService: false,
      },
      {
        lang: "en-US",
        name: "Microsoft Aria Online (Natural) - English (United States)",
        voiceURI: "aria",
        localService: false,
      },
    ]);
    seed(manual());
    render(<App />);

    const options = [...(screen.getByLabelText("英语朗读声音") as HTMLSelectElement).options];
    expect(options.map((o) => o.text)).toEqual([
      "Microsoft Aria Online (Natural) - English (United States) · 美国英语 · 在线",
      "Microsoft Andrew Multilingual Online (Natural) - English (United States) · 美国英语 · 在线 · 多语言，可能误判语言",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    expect((lastUtterance!.voice as { voiceURI: string }).voiceURI).toBe("aria");
    expect(lastUtterance!.lang).toBe("en-US");
  });

  it("系统没有英语声音时不拿别的语言的声音硬读，而是说清楚原因", () => {
    stubSpeech(undefined, VOICES.slice(2));
    seed(manual());
    render(<App />);

    expect(screen.getByText("没有英语语音")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "朗读" }));
    expect(spoken).toEqual([]);
    expect(screen.getByRole("alert").textContent).toContain("这台设备没有英语语音");
  });
});
