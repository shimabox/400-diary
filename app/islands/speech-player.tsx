import { useCallback, useRef, useState } from 'hono/jsx'

type Props = {
  audioSrc: string
}

/**
 * 公開ページの「声で聞く」ボタン。<audio> は DOM 内に置き、SPA 遷移で body が
 * 差し替わると一緒に外れて止まるようにする（new Audio() は DOM 外で鳴り続ける）。
 * 再生はクリックのイベントハンドラ内で呼び、iOS の自動再生制限に掛からないようにする。
 */
export default function SpeechPlayer({ audioSrc }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setIsPlaying(false)
  }, [])

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      stop()
      return
    }

    try {
      await audio.play()
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
    }
  }, [isPlaying, stop])

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isPlaying}
        style={{
          padding: '0.3rem 0.8rem',
          border: '1px solid var(--fg)',
          borderRadius: '4px',
          background: isPlaying ? 'var(--fg)' : 'transparent',
          color: isPlaying ? 'var(--bg)' : 'var(--fg)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '0.85rem',
        }}
      >
        {isPlaying ? '停止' : '声で聞く'}
      </button>
      {/* biome-ignore lint/a11y/useMediaCaption: 日記本文の読み上げで、本文がそのまま字幕の役割を果たす */}
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="none"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      />
    </>
  )
}
