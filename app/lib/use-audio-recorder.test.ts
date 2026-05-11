import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanupActiveRecording, useAudioRecorder } from './use-audio-recorder'

type MockStream = {
  stream: MediaStream
  track: { stop: ReturnType<typeof vi.fn> }
}

class MockMediaRecorder {
  static supportedTypes = new Set<string>()
  static isTypeSupported = vi.fn((type: string) =>
    MockMediaRecorder.supportedTypes.has(type),
  )

  static instances: MockMediaRecorder[] = []

  mimeType: string
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null
  start = vi.fn(() => {
    this.state = 'recording'
  })
  state = 'inactive'
  stop = vi.fn(() => {
    this.state = 'inactive'
    this.onstop?.()
  })

  constructor(
    readonly stream: MediaStream,
    readonly options?: MediaRecorderOptions,
  ) {
    this.mimeType = options?.mimeType ?? ''
    MockMediaRecorder.instances.push(this)
  }

  emitData(data: Blob) {
    this.ondataavailable?.({ data } as BlobEvent)
  }
}

function createMockStream(): MockStream {
  const track = { stop: vi.fn() }
  const stream = {
    getTracks: vi.fn(() => [track]),
  } as unknown as MediaStream
  return { stream, track }
}

function stubRecordingGlobals({
  getUserMedia,
  supportedTypes = ['audio/webm;codecs=opus'],
}: {
  getUserMedia: ReturnType<typeof vi.fn>
  supportedTypes?: string[]
}) {
  MockMediaRecorder.supportedTypes = new Set(supportedTypes)

  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia },
  })
  vi.stubGlobal('MediaRecorder', MockMediaRecorder)
}

beforeEach(() => {
  MockMediaRecorder.instances = []
  MockMediaRecorder.supportedTypes = new Set()
  MockMediaRecorder.isTypeSupported.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAudioRecorder', () => {
  // hono/jsx の hooks は render context 外でも初期値と callback を返す。
  // ここでは startRecording / stopRecording のブラウザAPI連携だけを検証する。
  test('録音停止時に音声 File を生成し media track を止める', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    const { stream, track } = createMockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    stubRecordingGlobals({ getUserMedia })
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const { startRecording, stopRecording } = useAudioRecorder()

    await startRecording({ onRecorded, onError })
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(MockMediaRecorder.instances).toHaveLength(1)

    const recorder = MockMediaRecorder.instances[0]
    expect(recorder.options).toEqual({ mimeType: 'audio/webm;codecs=opus' })
    expect(recorder.start).toHaveBeenCalledTimes(1)

    recorder.emitData(new Blob(['hello'], { type: 'audio/webm;codecs=opus' }))
    stopRecording()

    expect(recorder.stop).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(onRecorded).toHaveBeenCalledTimes(1)

    const file = onRecorded.mock.calls[0][0] as File
    expect(file.name).toBe('recording-1234567890.webm')
    expect(file.type).toBe('audio/webm;codecs=opus')
    await expect(file.text()).resolves.toBe('hello')

    stopRecording()
    expect(recorder.stop).toHaveBeenCalledTimes(1)
  })

  test('録音していないときの stopRecording は何もしない', async () => {
    const { stopRecording } = useAudioRecorder()
    expect(() => stopRecording()).not.toThrow()

    const { stream } = createMockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    stubRecordingGlobals({ getUserMedia })
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const recorderHook = useAudioRecorder()

    await recorderHook.startRecording({ onRecorded, onError })
    const recorder = MockMediaRecorder.instances[0]
    recorder.state = 'inactive'
    recorderHook.stopRecording()

    expect(recorder.stop).not.toHaveBeenCalled()
  })

  test('cleanup は録音中の onstop を外してから stop し track を止める', () => {
    const { stream, track } = createMockStream()
    const recorder = new MockMediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
    })
    recorder.start()
    const onStop = vi.fn()
    recorder.onstop = onStop

    cleanupActiveRecording(recorder as unknown as MediaRecorder, stream)

    expect(recorder.onstop).toBeNull()
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    expect(onStop).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  test('録音に対応していない環境ではエラーを返す', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('MediaRecorder', undefined)
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const { startRecording } = useAudioRecorder()

    await startRecording({ onRecorded, onError })
    expect(onRecorded).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('このブラウザでは録音できません')
  })

  test('マイクを取得できない場合はエラーを返す', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'))
    stubRecordingGlobals({ getUserMedia })
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const { startRecording } = useAudioRecorder()

    await startRecording({ onRecorded, onError })
    expect(onRecorded).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('マイクを使用できませんでした')
  })

  test('録音形式を判定できない場合は File を生成しない', async () => {
    const { stream, track } = createMockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    stubRecordingGlobals({ getUserMedia, supportedTypes: [] })
    const onRecorded = vi.fn()
    const onError = vi.fn()

    const { startRecording, stopRecording } = useAudioRecorder()

    await startRecording({ onRecorded, onError })
    const recorder = MockMediaRecorder.instances[0]
    recorder.emitData(new Blob(['hello']))
    stopRecording()

    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(onRecorded).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('録音形式を判定できませんでした')
  })
})
