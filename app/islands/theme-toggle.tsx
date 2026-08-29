import { useEffect, useState } from 'hono/jsx'
import { applyTheme, getEffectiveTheme, type Theme } from '../lib/theme'

/**
 * 配色の切り替え。トップのフッターとエディタのタイトル行（編集・プレビュー
 * 共通）に置き、周囲のリンクと同じ見た目のテキストで、日記の灯りを
 * 消す / つけるという言い方にする。選択はサイト全体に効く。
 *
 * SSR では実際の配色が分からないため、mount 後に見えている配色を読んで
 * ラベルを決める（それまでは中立な「灯り」）。
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(getEffectiveTheme())
    // 明示の選択が無い間は OS 設定の変化に追随する
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(getEffectiveTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const label =
    theme === null ? '灯り' : theme === 'dark' ? '灯りをつける' : '灯りを消す'

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next, { animate: true })
        setTheme(next)
      }}
      aria-label={
        theme === 'dark' ? 'ライト表示に切り替える' : 'ダーク表示に切り替える'
      }
      style={{
        font: 'inherit',
        padding: 0,
        border: 'none',
        background: 'none',
        color: 'var(--fg-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
