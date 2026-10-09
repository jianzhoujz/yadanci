import type { Bucket } from "@/lib/activity";
import { cn } from "@/lib/utils";

type Props = {
  buckets: Bucket[];
  /** 横轴每隔几根柱子标一次 */
  labelStep: number;
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
};

/**
 * 每日 / 每月学习词数的柱图。单序列，所以不需要图例——标题已经说明画的是什么。
 *
 * 没有悬浮气泡：手机上没有 hover，气泡还会被手指挡住。改成点/移上去选中某根柱子，
 * 由上层把这根柱子的数字显示在图的上方。
 */
export function ActivityChart({ buckets, labelStep, activeKey, onActiveChange }: Props) {
  const max = Math.max(...buckets.map((b) => b.log.words), 1);
  const last = buckets.length - 1;

  return (
    <div>
      <div className="flex h-24 items-end gap-[2px]">
        {buckets.map((bucket) => {
          const active = activeKey === bucket.key;
          const pct = (bucket.log.words / max) * 100;

          return (
            <button
              key={bucket.key}
              type="button"
              aria-label={`${bucket.full}，学习 ${bucket.log.words} 词`}
              aria-pressed={active}
              onClick={() => onActiveChange(active ? null : bucket.key)}
              onPointerEnter={(e) => e.pointerType === "mouse" && onActiveChange(bucket.key)}
              onPointerLeave={(e) => e.pointerType === "mouse" && onActiveChange(null)}
              onFocus={() => onActiveChange(bucket.key)}
              onBlur={() => onActiveChange(null)}
              className="group relative flex h-full flex-1 items-end outline-none"
            >
              {/* 命中区比柱子宽，柱子本身细，手指点得到 */}
              <span
                className={cn(
                  "absolute inset-x-0 inset-y-0 rounded-sm transition-colors",
                  active && "bg-muted",
                )}
              />
              <span
                style={{ height: bucket.log.words > 0 ? `max(6%, ${pct}%)` : "2px" }}
                className={cn(
                  "relative w-full rounded-t-[4px] transition-opacity",
                  bucket.log.words > 0 ? "bg-ok" : "bg-border",
                  activeKey !== null && !active && "opacity-45",
                )}
              />
            </button>
          );
        })}
      </div>

      <div className="text-muted-foreground mt-1.5 flex gap-[2px] text-[10px] tabular-nums">
        {buckets.map((bucket, i) => (
          <span key={bucket.key} className="flex-1 truncate text-center">
            {(last - i) % labelStep === 0 ? bucket.label : " "}
          </span>
        ))}
      </div>
    </div>
  );
}
