/**
 * 页面上是否有用户刚选中的文字。
 *
 * 拖选、双击选词结束时浏览器照样会派发 click；点读的元素在 click 里先问一句，
 * 选字时就不出声，用户才能复制、查词。
 */
export function hasSelection(): boolean {
  const sel = typeof window === "undefined" ? null : window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().trim() !== "";
}
