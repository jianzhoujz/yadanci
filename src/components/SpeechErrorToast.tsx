import { TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { SpeechFailure } from "@/lib/speech";

/** 自己消失的时间。留够读两行字 */
const AUTO_DISMISS_MS = 9000;

/**
 * 朗读失败时从底部冒出来的气泡。
 *
 * 之所以要有它：语音合成失败在手机上几乎全是静默的——点了喇叭什么都没发生，
 * 用户没法判断是自己没点中还是浏览器不行。把错误码和挑到的声音一起摆出来，
 * 远程帮人排查时能直接问「气泡上写的什么」。
 */
export function SpeechErrorToast({
  failure,
  onDismiss,
}: {
  failure: SpeechFailure;
  onDismiss: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  // failure 每次换新对象都重新计时。展开状态由调用方的 key 负责复位
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [failure, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role="alert"
        className="bg-popover text-popover-foreground pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-3 shadow-lg"
      >
        <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />

        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <p>{failure.message}</p>

          {failure.detail && (
            <>
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="text-muted-foreground hover:text-foreground mt-1 text-xs underline underline-offset-2"
              >
                {showDetail ? "收起详情" : "详情"}
              </button>
              {showDetail && (
                <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
                  {failure.detail}
                </p>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="关闭提示"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground hover:bg-accent -mt-1 -mr-1 shrink-0 rounded-lg p-1.5 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
