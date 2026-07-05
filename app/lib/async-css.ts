/**
 * `media="print"` で render-blocking を回避しつつ非同期取得している
 * `<link rel="stylesheet">`（_renderer.tsx の Google Fonts 読み込み）を
 * `media="all"` に切り替えて実際のスタイルとして適用する。
 *
 * 元は `<link ... onload="this.media='all'">` というインライン属性で行っていたが、
 * CSP の script-src から 'unsafe-inline' を排除するためクライアントバンドル側に移した。
 * onload（読み込み完了）を待たずに即座に切り替えているが、CSS 自体は既に非同期取得中で
 * あり media="print" のままにしていた目的（初期描画のブロック回避）はロード開始時点で
 * 達成済みのため、切り替えタイミングを早めても render-blocking には戻らない。
 * client.ts は async 読み込みなので、フォント適用までの FOUT 挙動も従来と大きくは変わらない。
 *
 * `<head>` は SPA ナビゲーションで再描画されないため、初回ロード時に一度呼べば十分。
 */
export function activateAsyncStylesheets(root: Document): void {
  const links = root.querySelectorAll<HTMLLinkElement>('link[data-async-css]')
  for (const link of links) {
    link.media = 'all'
  }
}
