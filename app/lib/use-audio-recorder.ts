import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import { audioExtension } from './audio-mime'

const RECORDING_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

type StartRecordingOptions = {
  onRecorded: (file: File) => void
  onError: (message: string) => void
}

function pickRecordingType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return (
    RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
  )
}

export function cleanupActiveRecording(
  recorder: MediaRecorder | null,
  stream: MediaStream | null,
) {
  if (recorder?.state === 'recording') {
    recorder.onstop = null
    recorder.stop()
  }
  for (const track of stream?.getTracks() ?? []) {
    track.stop()
  }
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      cleanupActiveRecording(
        mediaRecorderRef.current,
        recordingStreamRef.current,
      )
    }
  }, [])

  const startRecording = useCallback(
    async ({ onRecorded, onError }: StartRecordingOptions) => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        onError('このブラウザでは録音できません')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        const mimeType = pickRecordingType()
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)

        recordingStreamRef.current = stream
        recordingChunksRef.current = []
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            recordingChunksRef.current = [
              ...(recordingChunksRef.current ?? []),
              event.data,
            ]
          }
        }

        recorder.onstop = () => {
          const chunks = recordingChunksRef.current ?? []
          const type = recorder.mimeType || chunks[0]?.type
          const blob = new Blob(chunks, { type })
          recordingChunksRef.current = []
          for (const track of stream.getTracks()) {
            track.stop()
          }
          recordingStreamRef.current = null
          mediaRecorderRef.current = null
          setIsRecording(false)

          if (!type) {
            onError('録音形式を判定できませんでした')
            return
          }

          onRecorded(
            new File(
              [blob],
              `recording-${Date.now()}.${audioExtension(type)}`,
              {
                type,
              },
            ),
          )
        }

        recorder.start()
        setIsRecording(true)
      } catch {
        onError('マイクを使用できませんでした')
        setIsRecording(false)
      }
    },
    [],
  )

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  return {
    isRecording,
    startRecording,
    stopRecording,
  }
}
