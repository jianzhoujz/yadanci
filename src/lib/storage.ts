import type { StateStorage } from "zustand/middleware";

export const STORAGE_KEY = "yadanci.v1";

/**
 * 节流版 localStorage。
 *
 * 每答一题都整体序列化上千条学习记录再写盘，在手机上会拖慢翻卡手感，
 * 所以攒 500ms 批量写。页面隐藏或卸载时强制落盘 —— iOS Safari 的
 * `beforeunload` 并不可靠，必须监听 `pagehide` 和 `visibilitychange`。
 *
 * 所有读写都包了 try/catch：Safari 无痕模式下 localStorage 可能直接抛异常。
 */
const FLUSH_DELAY = 500;

let pending: { name: string; value: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function write(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    // 配额用尽或无痕模式：丢弃这次写入，不影响正在进行的背诵
  }
}

export function flushStorage() {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (pending) {
    write(pending.name, pending.value);
    pending = null;
  }
}

export const throttledStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    pending = { name, value };
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flushStorage, FLUSH_DELAY);
  },
  removeItem: (name) => {
    pending = null;
    if (timer !== undefined) clearTimeout(timer);
    try {
      localStorage.removeItem(name);
    } catch {
      // 同上，忽略
    }
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushStorage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushStorage();
  });
}

/**
 * 导出当前进度。
 *
 * iOS Safari 的 ITP 会在连续 7 天没访问站点后清掉 localStorage，
 * 「添加到主屏幕」能规避，但手动备份是更稳的兜底。
 */
export function exportProgress(): string {
  flushStorage();
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

export function downloadProgress() {
  const blob = new Blob([exportProgress()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yadanci-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导入进度并返回是否成功。调用方负责刷新页面让 store 重新水合 */
export function importProgress(json: string): boolean {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || !("state" in parsed)) return false;
    write(STORAGE_KEY, json);
    return true;
  } catch {
    return false;
  }
}
