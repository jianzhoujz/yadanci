import { ChevronDown, TriangleAlert, Volume2 } from "lucide-react";

import { useVoice } from "@/hooks/useVoice";
import { langName, voiceLabels } from "@/lib/speech";
import { cn } from "@/lib/utils";

/**
 * 当前朗读用的是哪个声音：名字、哪国口音、在线还是离线，点开可以换。
 *
 * 之所以要摆出来：朗读的发音由声音决定，不由 lang 决定。系统缺法语声音时
 * 浏览器会悄悄换成中文或英语的声音，用户只会觉得「读得怪」，看不出原因。
 *
 * 用原生 select 叠在文字上：手机上弹系统自带的选择器，比自己画的菜单好点。
 */
export function VoicePicker({
  lang,
  className,
  fallback = false,
}: {
  lang: string;
  className?: string;
  /** 声音列表还没到时显示「系统默认声音」占位，而不是什么都不显示 */
  fallback?: boolean;
}) {
  const { options, voice, missing, setVoice, voiceId } = useVoice(lang);

  if (missing) {
    return (
      <div
        className={cn("text-destructive flex items-center gap-1.5 text-xs", className)}
        title={`这台设备没有${langName(lang)}语音`}
      >
        <TriangleAlert className="size-3.5 shrink-0" />
        <span>没有{langName(lang)}语音</span>
      </div>
    );
  }
  // 声音列表还没到（Chrome 首次为空），或者这个 WebView 根本不报告声音：先不显示
  if (!voice) {
    return fallback ? (
      <span className={cn("text-muted-foreground text-xs", className)}>系统默认声音</span>
    ) : null;
  }

  const labels = voiceLabels(options);
  return (
    <label
      className={cn(
        "text-muted-foreground hover:text-foreground focus-within:ring-ring/50 relative flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-xs transition-colors focus-within:ring-[3px]",
        className,
      )}
      title={`${voice.name}（${voice.lang}）`}
      onClick={(e) => e.stopPropagation()}
    >
      <Volume2 className="size-3.5 shrink-0" />
      <span className="truncate">{labels.get(voiceId(voice))}</span>
      {options.length > 1 && <ChevronDown className="size-3.5 shrink-0" />}
      <select
        aria-label={`${langName(lang)}朗读声音`}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={voiceId(voice)}
        onChange={(e) => setVoice(e.target.value)}
        disabled={options.length < 2}
      >
        {options.map((v) => (
          <option key={voiceId(v)} value={voiceId(v)}>
            {labels.get(voiceId(v))}
          </option>
        ))}
      </select>
    </label>
  );
}
