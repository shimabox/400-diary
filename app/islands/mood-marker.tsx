import { useEffect, useState } from 'hono/jsx'
import { getMoodByKey } from '../lib/mood'

type Props = {
  moodKey: string | null
}

export default function MoodMarker({ moodKey }: Props) {
  const [active, setActive] = useState(false)
  const moodInfo = getMoodByKey(moodKey)

  useEffect(() => {
    if (!active) return
    const dismiss = () => setActive(false)
    document.addEventListener('click', dismiss)
    const timer = setTimeout(dismiss, 1000)
    return () => {
      document.removeEventListener('click', dismiss)
      clearTimeout(timer)
    }
  }, [active])

  if (!moodInfo) return null

  return (
    <button
      type="button"
      class="mood-legend-item"
      onClick={(e) => {
        e.stopPropagation()
        setActive((prev) => !prev)
      }}
      style={{
        position: 'relative',
        width: '0.9em',
        height: '0.9em',
        background: moodInfo.color,
        borderRadius: '2px',
        border: 'none',
        padding: 0,
        verticalAlign: 'middle',
        top: '0.1em',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        class={`mood-legend-label${active ? ' is-active' : ''}`}
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '4px',
          padding: '2px 6px',
          background: '#333',
          color: '#fff',
          borderRadius: '3px',
          fontSize: '0.7rem',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {moodInfo.label}
      </span>
    </button>
  )
}
