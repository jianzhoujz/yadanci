import { Download, Loader2, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dayKey } from "@/lib/activity";
import { renderShareCard } from "@/lib/shareCard";
import type { ShareStats } from "@/lib/shareCard";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 必须是稳定引用（上层 useMemo），否则每次渲染都会重画一遍图片 */
  stats: ShareStats;
};

/**
 * 打卡分享：先出图，再交给系统分享面板。
 *
 * 图片在对话框打开时就画好存着，点「分享」时同步调用 `navigator.share`——
 * Safari 要求 share() 在用户手势的同一个事件循环里调用，先 await 生成图片
 * 再分享会被当成非用户触发而拒绝。
 *
 * 不支持 Web Share 的浏览器（桌面 Firefox、Chrome 桌面版不带文件分享）退回下载图片。
 */
function SharePreview({ stats }: { stats: ShareStats }) {
  // 对话框关闭时 Radix 会卸载内容，所以这个组件每次打开都是全新的：
  // 出图状态从空开始，不用在 effect 里清理上一次的结果
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<File | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";

    renderShareCard(stats)
      .then((blob) => {
        if (!alive) return;
        fileRef.current = new File([blob], `yadanci-${dayKey(stats.at)}.png`, {
          type: "image/png",
        });
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "生成图片失败");
      });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [stats]);

  const save = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileRef.current?.name ?? "yadanci.png";
    a.click();
  };

  const share = async () => {
    const file = fileRef.current;
    if (!file) return;

    // 只放 files，绝对不要再塞 text / title：微信、QQ 这类接收方一旦看到
    // payload 里有文字，就只取那段文字发出去，图片被整个丢掉——
    // 表现是「点了分享却只发出去一句话」。想配文字让用户自己在聊天框里打。
    const data = { files: [file] };

    if (typeof navigator.share === "function" && navigator.canShare?.(data) === true) {
      try {
        await navigator.share(data);
      } catch (e) {
        // 用户在面板里点了取消，不是错误
        if ((e as Error).name !== "AbortError") {
          setNote("系统分享没能完成，可以改用「保存图片」再手动发送。");
        }
      }
      return;
    }

    save();
    setNote("这个浏览器不支持直接调起分享面板，已改为保存图片。");
  };

  return (
    <>
      <div className="bg-muted flex min-h-48 items-center justify-center overflow-hidden rounded-xl">
        {url ? (
          <img src={url} alt="今日打卡预览图" className="max-h-[52svh] w-auto" />
        ) : error ? (
          <p className="text-destructive p-6 text-center text-sm">{error}</p>
        ) : (
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        )}
      </div>

      {note && <p className="text-muted-foreground text-xs">{note}</p>}

      <div className="flex gap-2">
        <Button className="flex-1" disabled={!url} onClick={() => void share()}>
          <Share2 /> 分享
        </Button>
        <Button variant="outline" disabled={!url} onClick={save}>
          <Download /> 保存图片
        </Button>
      </div>
    </>
  );
}

export function ShareDialog({ open, onOpenChange, stats }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>分享</DialogTitle>
        </DialogHeader>

        <SharePreview stats={stats} />
      </DialogContent>
    </Dialog>
  );
}
