import { useCallback, useRef, useState } from 'hono/jsx'
import { baseMimeType } from '../lib/audio-mime'
import { MAX_AUDIO_SIZE } from '../lib/constants'
import { useAudioRecorder } from '../lib/use-audio-recorder'
import ConfirmDialog from './confirm-dialog'

const AUDIO_ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]

type Props = {
  diaryId: string | null
  audioKey: string | null
  onAudioKeyChange: (audioKey: string | null) => void
}

export default function AudioAttachmentEditor({
  diaryId,
  audioKey,
  onAudioKeyChange,
}: Props) {
  const [audioError, setAudioError] = useState('')
  const [audioUploading, setAudioUploading] = useState(false)
  const [showAudioDeleteConfirm, setShowAudioDeleteConfirm] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const { isRecording, startRecording, stopRecording } = useAudioRecorder()

  const audioSrc = audioKey ? `/api/audio/${audioKey}` : null

  const uploadAudioFile = useCallback(
    async (file: File) => {
      if (!diaryId) {
        setAudioError('先に日記を保存してください')
        return
      }

      setAudioError('')

      if (!AUDIO_ALLOWED_TYPES.includes(baseMimeType(file.type))) {
        setAudioError('MP3, WebM, MP4, WAV, Ogg のみアップロードできます')
        return
      }
      if (file.size > MAX_AUDIO_SIZE) {
        setAudioError(
          `音声は${MAX_AUDIO_SIZE / (1024 * 1024)}MB以内にしてください`,
        )
        return
      }

      setAudioUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`/api/diaries/${diaryId}/audio`, {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setAudioError(data.error || 'アップロードに失敗しました')
          return
        }
        const data = (await res.json()) as { audio_key: string }
        onAudioKeyChange(data.audio_key)
      } catch {
        setAudioError('アップロードに失敗しました')
      } finally {
        setAudioUploading(false)
        if (audioInputRef.current) audioInputRef.current.value = ''
      }
    },
    [diaryId, onAudioKeyChange],
  )

  const handleAudioChange = useCallback(
    async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      await uploadAudioFile(file)
    },
    [uploadAudioFile],
  )

  const handleAudioDelete = useCallback(async () => {
    setShowAudioDeleteConfirm(false)
    if (!diaryId) return

    setAudioError('')
    try {
      const res = await fetch(`/api/diaries/${diaryId}/audio`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setAudioError('削除に失敗しました')
        return
      }
      onAudioKeyChange(null)
    } catch {
      setAudioError('削除に失敗しました')
    }
  }, [diaryId, onAudioKeyChange])

  const handleRecordingClick = useCallback(() => {
    if (isRecording) {
      stopRecording()
      return
    }
    if (!diaryId) {
      setAudioError('先に日記を保存してください')
      return
    }
    setAudioError('')
    void startRecording({
      onRecorded: (file) => {
        void uploadAudioFile(file)
      },
      onError: setAudioError,
    })
  }, [diaryId, isRecording, startRecording, stopRecording, uploadAudioFile])

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '0.25rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {audioSrc && (
          // biome-ignore lint/a11y/useMediaCaption: ユーザー添付音声で、字幕データはまだ生成していない
          <audio
            src={audioSrc}
            controls
            preload="metadata"
            style={{ width: '160px', height: '32px' }}
          />
        )}
        <label
          style={{
            padding: '0.2rem 0.5rem',
            border: '1px solid #999',
            borderRadius: '4px',
            fontSize: '0.85rem',
            cursor: audioUploading || isRecording ? 'default' : 'pointer',
            opacity: audioUploading || isRecording ? 0.6 : 1,
          }}
        >
          {audioUploading
            ? 'アップロード中...'
            : audioKey
              ? '音声を変更'
              : '音声を追加'}
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/webm,audio/mp4,audio/wav,audio/ogg"
            onChange={handleAudioChange}
            disabled={audioUploading || isRecording}
            style={{ display: 'none' }}
          />
        </label>
        <button
          type="button"
          onClick={handleRecordingClick}
          disabled={audioUploading}
          style={{
            padding: '0.2rem 0.5rem',
            border: `1px solid ${isRecording ? '#c0392b' : '#999'}`,
            borderRadius: '4px',
            background: isRecording ? '#c0392b' : 'transparent',
            color: isRecording ? '#fff' : '#666',
            fontSize: '0.85rem',
            cursor: audioUploading ? 'default' : 'pointer',
            animation: isRecording ? 'pulse 1.5s infinite' : 'none',
          }}
        >
          {isRecording ? '録音停止' : audioKey ? '録音し直す' : '録音'}
        </button>
        {audioKey && (
          <button
            type="button"
            onClick={() => setShowAudioDeleteConfirm(true)}
            disabled={audioUploading || isRecording}
            style={{
              padding: '0.2rem 0.5rem',
              background: 'transparent',
              color: '#c0392b',
              border: '1px solid #c0392b',
              borderRadius: '4px',
              fontSize: '0.85rem',
              cursor: audioUploading || isRecording ? 'default' : 'pointer',
              opacity: audioUploading || isRecording ? 0.6 : 1,
            }}
          >
            音声を削除
          </button>
        )}
      </div>
      {audioError && (
        <p
          role="alert"
          style={{
            color: '#c0392b',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {audioError}
        </p>
      )}
      <ConfirmDialog
        open={showAudioDeleteConfirm}
        message="音声を削除しますか？"
        onConfirm={handleAudioDelete}
        onCancel={() => setShowAudioDeleteConfirm(false)}
      />
    </div>
  )
}
