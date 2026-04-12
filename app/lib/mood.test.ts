import { describe, expect, test } from 'vitest'
import { getMoodByKey, MOODS } from './mood'

describe('MOODS', () => {
  test('6種類の気分が定義されている', () => {
    expect(MOODS).toHaveLength(6)
  })

  test('すべてのキーがユニーク', () => {
    const keys = MOODS.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('getMoodByKey', () => {
  test('存在するキーで気分を取得できる', () => {
    const mood = getMoodByKey('happy')
    expect(mood).toBeDefined()
    expect(mood?.key).toBe('happy')
    expect(mood?.label).toBe('嬉しい')
  })

  test('すべてのキーで取得できる', () => {
    for (const mood of MOODS) {
      expect(getMoodByKey(mood.key)).toBe(mood)
    }
  })

  test('存在しないキーはundefinedを返す', () => {
    expect(getMoodByKey('unknown')).toBeUndefined()
  })

  test('nullはundefinedを返す', () => {
    expect(getMoodByKey(null)).toBeUndefined()
  })
})
