/**
 * 生成主屏幕/安装用的图标。
 *
 * 运行：vp run build:icons
 * 产物：public/icon-180.png（iOS apple-touch-icon）、icon-192.png、icon-512.png、favicon.svg
 *
 * 图案是一张卡片叠在另一张之上，正面画两条文本线 —— 闪卡的意思。
 * 纯算术绘制（圆角矩形的 SDF + 3×3 超采样抗锯齿），不引入图像库。
 * iOS 会自己把方形图标裁成圆角，所以这里铺满整个画布，不做圆角。
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

type RGB = [number, number, number];

const BG: RGB = [15, 15, 17];
const CARD: RGB = [255, 255, 255];
const INK: RGB = [15, 15, 17];

/** 以 1000×1000 为设计基准，渲染时按目标尺寸缩放 */
type Shape = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  color: RGB;
  alpha: number;
};

const SHAPES: Shape[] = [
  // 后面那张卡，压暗表示层叠
  { x0: 285, y0: 175, x1: 830, y1: 675, r: 80, color: CARD, alpha: 0.34 },
  // 正面的卡
  { x0: 170, y0: 325, x1: 715, y1: 825, r: 80, color: CARD, alpha: 1 },
  // 卡面上的两条文本线
  { x0: 250, y0: 455, x1: 600, y1: 515, r: 30, color: INK, alpha: 0.9 },
  { x0: 250, y0: 585, x1: 490, y1: 645, r: 30, color: INK, alpha: 0.9 },
];

/** 圆角矩形的有向距离场，小于 0 表示在形状内部 */
function sdRoundRect(px: number, py: number, s: Shape): number {
  const cx = (s.x0 + s.x1) / 2;
  const cy = (s.y0 + s.y1) / 2;
  const hx = (s.x1 - s.x0) / 2 - s.r;
  const hy = (s.y1 - s.y0) / 2 - s.r;
  const dx = Math.max(Math.abs(px - cx) - hx, 0);
  const dy = Math.max(Math.abs(py - cy) - hy, 0);
  return Math.hypot(dx, dy) - s.r;
}

const SS = 3; // 每个像素每轴的采样数

function renderRGBA(size: number): Buffer {
  const scale = 1000 / size;
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = BG[0];
      let g = BG[1];
      let b = BG[2];

      for (const s of SHAPES) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const px = (x + (sx + 0.5) / SS) * scale;
            const py = (y + (sy + 0.5) / SS) * scale;
            if (sdRoundRect(px, py, s) < 0) hits++;
          }
        }
        if (hits === 0) continue;

        const a = (hits / (SS * SS)) * s.alpha;
        r += (s.color[0] - r) * a;
        g += (s.color[1] - g) * a;
        b += (s.color[2] - b) * a;
      }

      const i = (y * size + x) * 4;
      out[i] = Math.round(r);
      out[i + 1] = Math.round(g);
      out[i + 2] = Math.round(b);
      out[i + 3] = 255;
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // 颜色类型 RGBA
  // 10..12 = 压缩/滤波/隔行，均为 0

  // 每条扫描线前置一个滤波类型字节，这里统一用 0（None）
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function svg(): string {
  const rect = (s: Shape) =>
    `<rect x="${s.x0}" y="${s.y0}" width="${s.x1 - s.x0}" height="${s.y1 - s.y0}" rx="${s.r}" ` +
    `fill="rgb(${s.color.join(",")})" fill-opacity="${s.alpha}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">` +
    `<rect width="1000" height="1000" rx="220" fill="rgb(${BG.join(",")})"/>` +
    SHAPES.map(rect).join("") +
    `</svg>\n`
  );
}

mkdirSync(OUT_DIR, { recursive: true });

for (const size of [180, 192, 512]) {
  const png = encodePNG(size, renderRGBA(size));
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), png);
  console.log(`icon-${size}.png  ${Math.round(png.length / 1024)} KB`);
}

writeFileSync(join(OUT_DIR, "favicon.svg"), svg());
console.log("favicon.svg");
