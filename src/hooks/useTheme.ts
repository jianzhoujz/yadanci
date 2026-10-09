import { useEffect } from "react";

import { useStore } from "@/store";

/** 地址栏 / 状态栏颜色，与 index.css 的 --background 对应 */
const THEME_COLORS = { light: "#ffffff", dark: "#0a0a0a" };

/**
 * 把主题设置同步到 <html>：dark class、原生控件的 color-scheme、浏览器栏颜色。
 *
 * 主题是手动切换的，不跟随系统——系统是深色时也默认白底。
 */
export function useTheme() {
  const theme = useStore((s) => s.settings.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[theme]);
  }, [theme]);
}
