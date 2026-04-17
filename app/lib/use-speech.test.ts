import { describe, expect, test } from 'vitest'
import { extractSpeechResults, isContinuableError } from './use-speech'

describe('extractSpeechResults', () => {
  test('final resultは1回だけfinalsに含まれる', () => {
    const results = [{ isFinal: true, transcript: 'こんにちは' }]
    const { finals, interim } = extractSpeechResults(results, 0)
    expect(finals).toEqual(['こんにちは'])
    expect(interim).toBe('')
  })

  test('interim resultはinterimに含まれfinalsには入らない', () => {
    const results = [{ isFinal: false, transcript: 'こんに' }]
    const { finals, interim } = extractSpeechResults(results, 0)
    expect(finals).toEqual([])
    expect(interim).toBe('こんに')
  })

  test('resultIndexから処理を開始する', () => {
    const results = [
      { isFinal: true, transcript: 'こんにちは' },
      { isFinal: false, transcript: 'せか' },
    ]
    const { finals, interim } = extractSpeechResults(results, 1)
    expect(finals).toEqual([])
    expect(interim).toBe('せか')
  })

  test('finalとinterimが混在する場合に正しく分離する', () => {
    const results = [
      { isFinal: true, transcript: 'こんにちは' },
      { isFinal: false, transcript: 'せかい' },
    ]
    const { finals, interim } = extractSpeechResults(results, 0)
    expect(finals).toEqual(['こんにちは'])
    expect(interim).toBe('せかい')
  })
})

describe('isContinuableError', () => {
  test('no-speechでは継続する', () => {
    expect(isContinuableError('no-speech')).toBe(true)
  })

  test('abortedでは継続しない', () => {
    expect(isContinuableError('aborted')).toBe(false)
  })

  test('その他のエラーでは継続しない', () => {
    expect(isContinuableError('network')).toBe(false)
    expect(isContinuableError('not-allowed')).toBe(false)
    expect(isContinuableError('audio-capture')).toBe(false)
  })
})
