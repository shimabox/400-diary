import { describe, expect, test } from 'vitest'
import {
  AUDIO_ACCEPT,
  AUDIO_ALLOWED_TYPES,
  audioExtension,
  baseMimeType,
  isAllowedAudioType,
} from './audio-mime'

describe('baseMimeType', () => {
  test('codec パラメータを除いた MIME type を返す', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
  })

  test('大小文字と余白を正規化する', () => {
    expect(baseMimeType(' Audio/WEBM ; codecs=opus')).toBe('audio/webm')
  })
})

describe('audioExtension', () => {
  test('audio/mpeg は mp3', () => {
    expect(audioExtension('audio/mpeg')).toBe('mp3')
  })

  test('codec パラメータ付きでもベース MIME type から拡張子を返す', () => {
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm')
  })

  test('未知の MIME type は bin', () => {
    expect(audioExtension('application/octet-stream')).toBe('bin')
  })
})

describe('isAllowedAudioType', () => {
  test('許可 MIME type を判定する', () => {
    expect(isAllowedAudioType('audio/webm')).toBe(true)
    expect(isAllowedAudioType('audio/webm;codecs=opus')).toBe(true)
    expect(isAllowedAudioType('text/plain')).toBe(false)
  })
})

describe('AUDIO_ACCEPT', () => {
  test('許可 MIME type と同じ値から生成される', () => {
    expect(AUDIO_ACCEPT).toBe(AUDIO_ALLOWED_TYPES.join(','))
  })
})
