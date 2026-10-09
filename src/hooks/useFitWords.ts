import { useLayoutEffect, useRef } from "react";

/** 缩小的下限：再小就不像标题了，这时宁可让超长词在词中间折行 */
export const MIN_FIT_SCALE = 0.55;

/**
 * 最长的单词要缩到多少倍才能放进一行。放得下就是 1。
 *
 * 留 2% 余量：canvas 量出来的宽度和实际排版偶尔差一两个像素，卡着边会被挤下去。
 */
export function fitScale(longestWord: number, available: number): number {
  if (longestWord <= 0 || available <= 0 || longestWord <= available) return 1;
  return Math.max(MIN_FIT_SCALE, (available / longestWord) * 0.98);
}

let canvas: HTMLCanvasElement | undefined;

/** 按元素当前字体量出最长单词的宽度。取不到 canvas（测试环境）时返回 0，即不缩放 */
function longestWordWidth(el: HTMLElement, text: string): number {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;

  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return Math.max(0, ...text.split(/\s+/).map((w) => ctx.measureText(w).width));
}

/**
 * 让文本里最长的单词一行放得下：放不下就按比例缩小这个元素的字号。
 *
 * 只按「单词」算，不按整段——多词短语本来就该在空格处换行，
 * 要避免的是 disproportionately、l'embourgeoisement 这种长词被从中间折断。
 * 基准字号取自元素的 class（含响应式断点），所以每次先清掉内联字号再量。
 */
export function useFitWords<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      el.style.fontSize = "";
      const scale = fitScale(longestWordWidth(el, text), el.clientWidth);
      if (scale < 1) {
        el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * scale}px`;
      }
    };

    fit();
    // 转屏、窗口缩放、朗读按钮出现消失都会改变可用宽度；只在宽度变了时重算，
    // 避免缩小字号引起的高度变化又触发自己
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return ref;
}
