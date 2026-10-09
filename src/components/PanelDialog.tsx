import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  children: ReactNode;
};

/**
 * 背诵页的弹窗外壳：标题固定，正文超高时自己滚动。
 *
 * DialogContent 默认是 grid：内容行按内容撑高再被 overflow-hidden 裁掉，
 * 滚动区拿不到高度上限，整个弹窗就滚不动、底部内容看不见。所以这里换成 flex 列，
 * 滚动区（min-h-0）才会被压到剩余高度里、自己出滚动条。
 */
export function PanelDialog({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
