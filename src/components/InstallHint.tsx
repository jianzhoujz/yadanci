import { Share, SquarePlus } from "lucide-react";

/**
 * 只在 iOS 且尚未安装到主屏幕时出现。
 *
 * 出这个提示的原因是 WebKit 的 ITP：连续 7 天浏览器使用时间内没访问本站，
 * localStorage 会被清空，背诵进度就没了。从主屏幕以 standalone 模式启动的
 * Web App 不受这条限制。换 Chrome 或 Edge 解决不了——iOS 上所有浏览器
 * 都跑在 WebKit 上，但它们同样能把网页装到主屏幕。
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ 的 UA 伪装成 macOS，靠触点数区分
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || legacy === true;
}

export function InstallHint() {
  if (!isIOS() || isStandalone()) return null;

  return (
    <section className="bg-muted/40 mt-8 rounded-xl border p-4">
      <h2 className="text-sm font-semibold">建议添加到主屏幕</h2>
      <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
        背诵进度只存在这台设备的浏览器里。iOS 会在连续 7 天没访问本站后把它清空， 换 Chrome 或 Edge
        也一样（iOS 上所有浏览器都跑在 WebKit 上）。 从主屏幕打开则不受这条限制。
      </p>

      <dl className="mt-3 flex flex-col gap-2 text-xs">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 font-medium">Safari</dt>
          <dd className="text-muted-foreground flex flex-wrap items-center gap-1">
            底部
            <Share className="size-3.5" />
            分享 →
            <SquarePlus className="size-3.5" />
            添加到主屏幕
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 font-medium">Chrome</dt>
          <dd className="text-muted-foreground">
            右下角 <span className="font-medium">⋯</span> → 分享 → 添加到主屏幕
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 font-medium">Edge</dt>
          <dd className="text-muted-foreground">
            底部 <span className="font-medium">⋯</span> → 共享 → 添加到主屏幕
          </dd>
        </div>
      </dl>

      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
        Chrome 与 Edge 需要 iOS 16.4 以上；更早的系统只有 Safari 能装。
        另外主屏幕上的应用和浏览器里的数据是
        <span className="text-foreground font-medium">分开存</span>的，
        装完等于从零开始——已经背过一些的话，先在设置里导出进度，装好后再导入。
      </p>
    </section>
  );
}
