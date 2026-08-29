/**
 * 配色（ライト / ダーク）の選択。
 *
 * 選択は localStorage の 'theme' に 'light' | 'dark' で保存し、<html data-theme>
 * に反映する。保存が無ければ OS の設定（prefers-color-scheme）に従う。
 */
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/** 保存された選択。無効な値・未保存・storage 不可のときは null */
export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

/** 実際に見えている配色。明示の選択があればそれ、無ければ OS 設定 */
export function getEffectiveTheme(): Theme {
  const explicit = document.documentElement.dataset.theme
  if (isTheme(explicit)) return explicit
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * 切り替え中だけ <html> に付けるクラス。global.css がこのクラスの間だけ
 * 色のトランジションを有効にする（常時有効にすると初回描画や OS 設定の
 * 変化でも色が動いてしまう）
 */
export const THEME_TRANSITION_CLASS = 'theme-transition'
/** global.css の --td と揃える */
export const THEME_TRANSITION_MS = 700

let transitionTimer: ReturnType<typeof setTimeout> | undefined

/**
 * 選択を保存して反映する。
 * animate を指定すると、地と用紙の色がじんわり移るようにする
 */
export function applyTheme(
  theme: Theme,
  { animate = false }: { animate?: boolean } = {},
): void {
  const root = document.documentElement
  if (animate) {
    root.classList.add(THEME_TRANSITION_CLASS)
    clearTimeout(transitionTimer)
    transitionTimer = setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS)
    }, THEME_TRANSITION_MS + 50)
  }
  root.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 保存できなくても表示は切り替わる
  }
}

/**
 * 保存された選択を HTML パース時に <html data-theme> へ反映するインラインスクリプト。
 * クライアントバンドルの実行を待つと OS 設定の配色が一瞬見えてちらつくため、
 * これだけは head のインラインスクリプトとして置き、CSP は 'unsafe-inline' ではなく
 * SHA-256 ハッシュでこのスクリプトのみを許可する。
 *
 * 文字列を1文字でも変更するとハッシュが一致せず CSP にブロックされるため、
 * スクリプト本体とハッシュは必ずこのファイルで一緒に管理し、両者の整合は
 * theme.test.ts が検証する（変更時はテストが新しいハッシュを教えてくれる）。
 */
export const THEME_INLINE_SCRIPT = `(()=>{try{const t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}})();`

/** 上記スクリプトの CSP 用ハッシュ (base64(sha256(script))) */
export const THEME_INLINE_SCRIPT_HASH =
  "'sha256-1G6OvS8hrVfb98inG37e4HRyvImRTV9wJrTjTniHu/w='"
