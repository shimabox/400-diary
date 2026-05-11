import { describe, expect, test } from 'vitest'
import {
  AUDIO_ACCEPT,
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
  test('アップロード可能な音声 MIME type を許可する', () => {
    expect(isAllowedAudioType('audio/mpeg')).toBe(true)
    expect(isAllowedAudioType('audio/mp3')).toBe(true)
    expect(isAllowedAudioType('audio/webm')).toBe(true)
    expect(isAllowedAudioType('audio/mp4')).toBe(true)
    expect(isAllowedAudioType('audio/wav')).toBe(true)
    expect(isAllowedAudioType('audio/ogg')).toBe(true)
  })

  test('codec パラメータ付きの録音 MIME type を許可する', () => {
    expect(isAllowedAudioType('audio/webm;codecs=opus')).toBe(true)
  })

  test('音声以外の MIME type を拒否する', () => {
    expect(isAllowedAudioType('text/plain')).toBe(false)
  })
})

describe('AUDIO_ACCEPT', () => {
  test('file input の accept に渡す具体値を公開する', () => {
    expect(AUDIO_ACCEPT).toBe(
      'audio/mpeg,audio/mp3,audio/webm,audio/mp4,audio/wav,audio/ogg',
    )
  })
})
