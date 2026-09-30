import { useCallback, useRef, useState } from 'hono/jsx'
import {
  deriveSpeechView,
  initialSpeechState,
  type SpeechBasis,
  speechDraftSrc,
} from '../lib/speech-editor-state'
import { speechStyleForMood } from '../lib/speech-style'
import ConfirmDialog from './confirm-dialog'

const GENERATION_FAILED = '音声を作れませんでした'
const DELETE_FAILED = '音声を削除できませんでした'
const DIARY_CHANGED =
  '作成中に日記が変わったため、音声を記録しませんでした。保存してからページを再読み込みしてください'

type Props = {
  diaryId: string
  /** API キーと声 ID が設定されていて音声を作れるか */
  available: boolean
  /** ページを開いた時点の下書きの音声のキー */
  initialKey: string | null
  /** ページを開いた時点で、音声が保存済みの本文と気分に合っているか（サーバで判定） */
  initialMatches: boolean
  /** ページを開いた時点の保存済みの本文と気分 */
  initialSource: SpeechBasis
  /** 音声を削除したとき。削除で公開版の音声も消えるので、親が手元の公開版のキーを消す */
  onSpeechDeleted: () => void
  /** 公開版の音声のキー。未公開の日記なら undefined */
  publishedKey: string | null | undefined
  /** 最後に保存した本文と気分 */
  saved: SpeechBasis | null
  /** 編集中の本文と気分 */
  current: SpeechBasis
  speechPublic: boolean
  onSpeechPublicChange: (value: boolean) => void
}

const smallButtonStyle = {
  padding: '0.2rem 0.5rem',
  border: '1px solid var(--border-strong)',
  borderRadius: '4px',
  background: 'transparent',
  color: 'var(--fg-muted)',
  fontSize: '0.85rem',
}

export default function SpeechEditor({
  diaryId,
  available,
  initialKey,
  initialMatches,
  initialSource,
  onSpeechDeleted,
  publishedKey,
  saved,
  current,
  speechPublic,
  onSpeechPublicChange,
}: Props) {
  const [speech, setSpeech] = useState(() =>
    initialSpeechState({
      key: initialKey,
      matches: initialMatches,
      ...initialSource,
    }),
  )
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'generate' | 'delete' | null>(null)
  // 生成の応答が返った時点の編集内容を見るため、最新の値を ref に置く
  const hasUnsavedChangesRef = useRef(false)
  hasUnsavedChangesRef.current =
    saved === null || saved.body !== current.body || saved.mood !== current.mood

  const view = deriveSpeechView({
    state: speech,
    available,
    saved,
    current,
    publishedKey,
    generating,
    deleting,
    error,
  })
  // 生成は保存済みの気分から話し方を決める（未保存の変更があるときは作らせない）
  const style = speechStyleForMood(saved?.mood ?? null)
  const styleDetail = `話し方: ${style.label}（${
    style.moodLabel ? `気分「${style.moodLabel}」から` : '気分なし'
  }）`

  const handleGenerate = useCallback(async () => {
    setConfirm(null)
    if (!saved) return
    const source = saved
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(
        `/api/diaries/${encodeURIComponent(diaryId)}/speech`,
        { method: 'POST' },
      )
      if (res.status === 409) {
        // 生成中に本文の保存や別の画面での音声の削除があり、手元の音声の状態が
        // 古い可能性がある。未保存の編集が無ければ読み込み直して最新に合わせる
        if (!hasUnsavedChangesRef.current) {
          window.location.reload()
          return
        }
        setError(DIARY_CHANGED)
        return
      }
      if (!res.ok) {
        setError(GENERATION_FAILED)
        return
      }
      const data = (await res.json()) as { speech_key: string }
      setSpeech({ key: data.speech_key, basis: source })
    } catch {
      setError(GENERATION_FAILED)
    } finally {
      setGenerating(false)
    }
  }, [diaryId, saved])

  const handleDelete = useCallback(async () => {
    setConfirm(null)
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(
        `/api/diaries/${encodeURIComponent(diaryId)}/speech`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        setError(DELETE_FAILED)
        return
      }
      setSpeech({ key: null, basis: null })
      onSpeechDeleted()
    } catch {
      setError(DELETE_FAILED)
    } finally {
      setDeleting(false)
    }
  }, [diaryId, onSpeechDeleted])

  // 出すものが無ければ、ツールバーに空の欄を残さない
  if (!view.showControls) return null

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.25rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {speech.key && (
        // biome-ignore lint/a11y/useMediaCaption: 日記本文の読み上げで、本文がそのまま字幕の役割を果たす
        <audio
          src={speechDraftSrc(diaryId, speech.key)}
          controls
          preload="metadata"
          aria-label="下書きの音声"
          style={{ width: '280px', maxWidth: '100%', height: '32px' }}
        />
      )}
      {view.showGenerate && (
        <button
          type="button"
          onClick={() => setConfirm('generate')}
          disabled={view.generateDisabled}
          style={{
            ...smallButtonStyle,
            cursor: view.generateDisabled ? 'default' : 'pointer',
            opacity: view.generateDisabled ? 0.6 : 1,
          }}
        >
          {view.generateLabel}
        </button>
      )}
      {view.hasSpeech && (
        <button
          type="button"
          onClick={() => setConfirm('delete')}
          disabled={view.deleteDisabled}
          style={{
            ...smallButtonStyle,
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            cursor: view.deleteDisabled ? 'default' : 'pointer',
            opacity: view.deleteDisabled ? 0.6 : 1,
          }}
        >
          音声を削除
        </button>
      )}
      {view.showSpeechPublic && (
        <label
          title="公開したときに反映されます"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.2rem',
            fontSize: '0.85rem',
            color: 'var(--fg-muted)',
          }}
        >
          <input
            type="checkbox"
            checked={speechPublic}
            onChange={(e) =>
              onSpeechPublicChange((e.target as HTMLInputElement).checked)
            }
          />
          訪問者も声で聞ける
          <span style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
            （公開したときに反映されます）
          </span>
        </label>
      )}
      {view.notice && (
        <span
          role={error && !generating ? 'alert' : 'status'}
          style={{
            fontSize: '0.8rem',
            color: error && !generating ? 'var(--danger)' : 'var(--fg-subtle)',
          }}
        >
          {view.notice}
        </span>
      )}
      <ConfirmDialog
        open={confirm === 'generate'}
        message="本人の声で音声を作ります（1 回あたり約 3 円）"
        detail={styleDetail}
        confirmLabel="作る"
        confirmTone="accent"
        onConfirm={handleGenerate}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        message="音声を削除しますか？"
        detail="公開中のページの音声も消え、誰も聞けなくなります。"
        confirmLabel="削除する"
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
