import { expect, test } from 'vitest'
import { MAX_BODY_LENGTH } from './constants'

test('日記の最大文字数は400', () => {
  expect(MAX_BODY_LENGTH).toBe(400)
})
