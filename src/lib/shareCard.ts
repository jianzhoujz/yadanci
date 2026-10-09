import { accuracyOf, formatDuration } from "@/lib/activity";
import type { Bucket } from "@/lib/activity";
import type { DayLog } from "@/types";

/**
 * 打卡图片。用 Canvas 2D 一笔一笔画出来，不引任何截图 / 图像库。
 *
 * 为什么不用 html2canvas 之类把 DOM 转成图：那类库对 Tailwind 的 oklch 颜色、
 * CSS 变量和 svg 图标支持都不稳，体积还大。这张图的排版是固定的，直接画更短也更可控。
 *
 * 尺寸固定 1080×1440（3:4）。微信聊天与朋友圈按这个比例显示不会被裁。
 */
export const SHARE_W = 1080;
export const SHARE_H = 1440;

const FONT = `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;

const INK = "#ffffff";
const MUTED = "rgba(255, 255, 255, 0.62)";
const FAINT = "rgba(255, 255, 255, 0.14)";
const ACCENT = "#3fcf8e";

export type ShareStats = {
  /** 出图时间，决定图上的日期 */
  at: number;
  today: DayLog;
  streak: number;
  /** 累计打卡天数 */
  days: number;
  /** 累计学习词数 */
  totalWords: number;
  /** 已掌握词数，跨词表合计 */
  mastered: number;
  /** 近 7 天，画底部的小柱图 */
  week: Bucket[];
};

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function text(
  ctx: CanvasRenderingContext2D,
  content: string,
  x: number,
  y: number,
  opts: { size: number; weight?: number; color?: string; align?: CanvasTextAlign },
) {
  ctx.font = font(opts.weight ?? 400, opts.size);
  ctx.fillStyle = opts.color ?? INK;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(content, x, y);
}

/** 一格统计：上面数值下面标签，三列并排 */
function statColumn(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  label: string,
) {
  text(ctx, value, x, y, { size: 64, weight: 600, align: "center" });
  text(ctx, label, x, y + 52, { size: 32, color: MUTED, align: "center" });
}

function drawWeekChart(ctx: CanvasRenderingContext2D, week: Bucket[], top: number) {
  const left = 96;
  const right = SHARE_W - 96;
  const height = 160;
  const slot = (right - left) / week.length;
  const barW = Math.min(64, slot * 0.56);
  const max = Math.max(...week.map((b) => b.log.words), 1);

  for (const [i, bucket] of week.entries()) {
    const cx = left + slot * (i + 0.5);
    const isToday = i === week.length - 1;
    // 空白日也留一条底线，否则一周没背的图看起来像渲染坏了
    const h = Math.max(6, (bucket.log.words / max) * height);

    ctx.fillStyle = isToday ? ACCENT : bucket.log.words > 0 ? "rgba(63, 207, 142, 0.55)" : FAINT;
    roundRect(ctx, cx - barW / 2, top + height - h, barW, h, 12);
    ctx.fill();

    text(ctx, bucket.label, cx, top + height + 46, {
      size: 30,
      color: isToday ? INK : MUTED,
      align: "center",
    });
  }
}

export function drawShareCard(canvas: HTMLCanvasElement, s: ShareStats): void {
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器没有给出 canvas 2d 上下文");

  const bg = ctx.createLinearGradient(0, 0, SHARE_W * 0.4, SHARE_H);
  bg.addColorStop(0, "#111c2e");
  bg.addColorStop(0.55, "#10222b");
  bg.addColorStop(1, "#0d1a1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  // 右上角一团绿光，纯装饰，让纯深色背景不至于太平
  const glow = ctx.createRadialGradient(SHARE_W - 120, 60, 0, SHARE_W - 120, 60, 620);
  glow.addColorStop(0, "rgba(63, 207, 142, 0.26)");
  glow.addColorStop(1, "rgba(63, 207, 142, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  const d = new Date(s.at);
  text(ctx, `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`, 96, 130, {
    size: 36,
    color: MUTED,
  });

  text(ctx, "今天背了", 96, 320, { size: 44, color: MUTED });

  ctx.font = font(700, 200);
  const hero = String(s.today.words);
  const heroW = ctx.measureText(hero).width;
  text(ctx, hero, 96, 490, { size: 200, weight: 700, color: ACCENT });
  text(ctx, "个词", 96 + heroW + 24, 490, { size: 56, weight: 500 });

  const third = (SHARE_W - 192) / 3;
  const statY = 640;
  statColumn(ctx, 96 + third * 0.5, statY, formatDuration(s.today.ms), "学习时长");
  statColumn(ctx, 96 + third * 1.5, statY, `${accuracyOf(s.today)}%`, "正确率");
  statColumn(ctx, 96 + third * 2.5, statY, String(s.today.mastered), "新掌握");

  // 连续打卡的药丸标签
  const pill = `连续打卡 ${s.streak} 天`;
  ctx.font = font(600, 38);
  const pillW = ctx.measureText(pill).width + 108;
  const pillX = (SHARE_W - pillW) / 2;
  ctx.fillStyle = "rgba(63, 207, 142, 0.16)";
  roundRect(ctx, pillX, 780, pillW, 88, 44);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(pillX + 44, 824, 12, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, pill, pillX + 72, 838, { size: 38, weight: 600 });

  text(ctx, "近 7 天", 96, 975, { size: 34, color: MUTED });
  drawWeekChart(ctx, s.week, 1000);

  ctx.fillStyle = FAINT;
  ctx.fillRect(96, 1270, SHARE_W - 192, 2);

  const summary = `累计打卡 ${s.days} 天 · 学习 ${s.totalWords} 词 · 已掌握 ${s.mastered} 词`;
  text(ctx, summary, SHARE_W / 2, 1345, { size: 34, color: MUTED, align: "center" });
}

export function renderShareCard(s: ShareStats): Promise<Blob> {
  // 画布创建与绘制都放进 executor：画不出来时变成 rejected promise，
  // 而不是在调用处同步抛出——调用它的是 effect，同步抛会直接把组件炸掉
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    drawShareCard(canvas, s);
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("这个浏览器不支持把画布导出成图片"));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("导出图片失败"));
    }, "image/png");
  });
}
