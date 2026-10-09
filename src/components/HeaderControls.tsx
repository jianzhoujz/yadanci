import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SPEECH_RATES, useStore } from "@/store";

/** 右上角的深浅色切换 */
export function ThemeToggle() {
  const theme = useStore((s) => s.settings.theme);
  const updateSettings = useStore((s) => s.updateSettings);
  const dark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="nav"
      onClick={() => updateSettings({ theme: dark ? "light" : "dark" })}
      aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

/** 朗读语速：点一下换下一档，循环 */
export function SpeechRateButton() {
  const rate = useStore((s) => s.settings.speechRate);
  const updateSettings = useStore((s) => s.updateSettings);

  // 存档里的值不在档位里（比如以后改了档位），当成第一档往后切
  const index = SPEECH_RATES.findIndex((r) => r.value === rate);
  const next = SPEECH_RATES[(index + 1) % SPEECH_RATES.length];
  const label = SPEECH_RATES[index]?.label ?? "自定义";

  return (
    <Button
      variant="ghost"
      className="text-muted-foreground h-11 px-3 text-base tabular-nums"
      onClick={() => updateSettings({ speechRate: next.value })}
      aria-label={`朗读语速：${label}，点一下切换到${next.label}`}
    >
      语速 {label}
    </Button>
  );
}
