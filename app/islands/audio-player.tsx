import { useCallback, useRef, useState } from 'hono/jsx'

type Props = {
  audioSrc: string
}

export default function AudioPlayer({ audioSrc }: Props) {
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
          border: '1px solid #333',
          borderRadius: '4px',
          background: isPlaying ? '#333' : 'transparent',
          color: isPlaying ? '#fff' : '#333',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '0.85rem',
        }}
      >
        {isPlaying ? '停止' : '声で聞く'}
      </button>
      {/* biome-ignore lint/a11y/useMediaCaption: ユーザー添付音声で、字幕データはまだ生成していない */}
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      />
    </>
  )
}
