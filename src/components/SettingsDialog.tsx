import { PanelDialog } from "@/components/PanelDialog";
import { VoicePicker } from "@/components/VoicePicker";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { speechSupported } from "@/lib/speech";
import { SPEECH_RATES, useStore } from "@/store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NEW_CARD_LIMITS = [
  { value: "0", label: "不限" },
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
];

/** 背诵设置。对所有词表都生效 */
export function SettingsDialog({ open, onOpenChange }: Props) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  return (
    <PanelDialog
      open={open}
      onOpenChange={onOpenChange}
      title="设置"
      description="对所有词表都生效"
    >
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={settings.includeMastered}
          onCheckedChange={(v) => updateSettings({ includeMastered: v === true })}
          className="mt-0.5"
        />
        <span>
          <span className="text-sm font-medium">已掌握的词也出现</span>
          <span className="text-muted-foreground block text-xs">
            以最低权重偶尔出现，顺带复习。关掉后已掌握的词就不再出现
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={settings.autoSpeak}
          onCheckedChange={(v) => updateSettings({ autoSpeak: v === true })}
          className="mt-0.5"
        />
        <span>
          <span className="text-sm font-medium">自动朗读词条</span>
          <span className="text-muted-foreground block text-xs">
            看词猜义时换到新词就读，看义猜词时翻面再读。卡片上的喇叭按钮随时可以手动触发
          </span>
        </span>
      </label>

      <div>
        <div className="text-sm font-medium">朗读语速</div>
        <p className="text-muted-foreground mt-0.5 mb-2 text-xs">
          不同浏览器的语音引擎快慢不一样，挑一档听着舒服的
        </p>
        <ToggleGroup
          type="single"
          className="w-full"
          value={String(settings.speechRate)}
          onValueChange={(v) => v && updateSettings({ speechRate: Number(v) })}
        >
          {SPEECH_RATES.map((opt) => (
            <ToggleGroupItem key={opt.value} value={String(opt.value)}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {speechSupported() && (
        <div>
          <div className="text-sm font-medium">朗读声音</div>
          <p className="text-muted-foreground mt-0.5 mb-2 text-xs">
            发音由声音决定，默认优先美音。在线声音由浏览器联网合成，通常更自然；离线声音装在系统里，断网也能用。
          </p>
          <div className="flex flex-col gap-2">
            <VoicePicker lang="en" className="min-w-0 flex-1 text-sm" fallback />
          </div>
        </div>
      )}

      <div>
        <div className="text-sm font-medium">新词节流</div>
        <p className="text-muted-foreground mt-0.5 mb-2 text-xs">
          同时最多放多少个没背过的词进池子。背熟一个补一个，避免上千个新词一起涌上来。
        </p>
        <ToggleGroup
          type="single"
          className="w-full"
          value={String(settings.newCardLimit)}
          onValueChange={(v) => v && updateSettings({ newCardLimit: Number(v) })}
        >
          {NEW_CARD_LIMITS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value}>
              {opt.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </PanelDialog>
  );
}
