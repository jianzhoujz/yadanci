import { useEffect } from "react";

import { useStore } from "@/store";

/**
 * 背诵页在场时的学习计时。
 *
 * store 只在两次操作之间累加时长，所以必须有心跳：不然一个人盯着卡片想两分钟，
 * 这段间隔会超过 `IDLE_GAP_MS` 被整段丢掉。心跳间隔要远小于那个上限。
 *
 * 切后台就停表。iOS Safari 的 `beforeunload` 不可靠，和 storage.ts 一样
 * 监听 `pagehide` 与 `visibilitychange`。
 */
const TICK_MS = 15_000;

export function useStudyClock(enabled: boolean) {
  const tickActivity = useStore((s) => s.tickActivity);
  const pauseActivity = useStore((s) => s.pauseActivity);

  useEffect(() => {
    if (!enabled) return;

    tickActivity();
    const timer = setInterval(tickActivity, TICK_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pauseActivity();
      else tickActivity();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pauseActivity);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pauseActivity);
      pauseActivity();
    };
  }, [enabled, tickActivity, pauseActivity]);
}
