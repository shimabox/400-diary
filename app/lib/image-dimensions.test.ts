import { describe, expect, test } from 'vitest'
import {
  chooseLayoutImageSize,
  resolveEditorImage,
  toImageSize,
} from './image-dimensions'

describe('toImageSize', () => {
  test('幅と高さが両方そろっていれば寸法の組にする', () => {
    expect(toImageSize(1200, 900)).toEqual({ width: 1200, height: 900 })
  })

  test('片方でも欠けている・正でない値なら寸法なし', () => {
    expect(toImageSize(null, null)).toBeNull()
    expect(toImageSize(1200, null)).toBeNull()
    expect(toImageSize(undefined, 900)).toBeNull()
    expect(toImageSize(0, 900)).toBeNull()
    expect(toImageSize(1200, -1)).toBeNull()
    expect(toImageSize(Number.NaN, 900)).toBeNull()
  })
})

describe('chooseLayoutImageSize', () => {
  const src = '/api/images/diaries/abc/a.jpg'

  test('読み込み前は渡された寸法で組む', () => {
    expect(
      chooseLayoutImageSize(null, src, { width: 1200, height: 900 }),
    ).toEqual({ width: 1200, height: 900 })
  })

  test('いまの画像の読み込みが終わっていれば、渡された寸法より実寸を使う', () => {
    // 保存された寸法が間違っていても、読み込み後は実寸で組む
    expect(
      chooseLayoutImageSize({ src, width: 800, height: 600 }, src, {
        width: 1200,
        height: 900,
      }),
    ).toEqual({ width: 800, height: 600 })
  })

  test('前の画像を測った実寸は使わず、いまの画像に渡された寸法を使う', () => {
    expect(
      chooseLayoutImageSize(
        { src: '/api/images/diaries/abc/old.jpg', width: 800, height: 600 },
        src,
        { width: 1200, height: 900 },
      ),
    ).toEqual({ width: 1200, height: 900 })
  })

  test('寸法も実寸も無ければ null（読み込み後に組む）', () => {
    expect(chooseLayoutImageSize(null, src, null)).toBeNull()
    expect(chooseLayoutImageSize(null, src, undefined)).toBeNull()
    expect(
      chooseLayoutImageSize(
        { src: '/api/images/diaries/abc/old.jpg', width: 800, height: 600 },
        src,
        null,
      ),
    ).toBeNull()
  })

  test('画像が無ければ寸法も実寸も使わない', () => {
    expect(
      chooseLayoutImageSize({ src, width: 800, height: 600 }, null, {
        width: 1200,
        height: 900,
      }),
    ).toBeNull()
  })

  test('使えない寸法（0 や NaN）が渡されたら寸法なしとして扱う', () => {
    expect(chooseLayoutImageSize(null, src, { width: 0, height: 900 })).toBe(
      null,
    )
    expect(
      chooseLayoutImageSize(null, src, { width: Number.NaN, height: 900 }),
    ).toBeNull()
  })
})

describe('resolveEditorImage', () => {
  const saved = {
    key: 'diaries/abc/saved.jpg',
    size: { width: 1200, height: 900 },
  }
  const preview = {
    src: 'data:image/jpeg;base64,AAAA',
    size: { width: 300, height: 400 },
  }

  test('プレビュー中はプレビューの画像と寸法を使い、保存済みの寸法を使わない', () => {
    expect(resolveEditorImage(preview, saved)).toEqual({
      src: preview.src,
      size: { width: 300, height: 400 },
    })
  })

  test('プレビューの寸法が測れていなければ、保存済みの寸法で代用せず寸法なし', () => {
    expect(resolveEditorImage({ ...preview, size: null }, saved)).toEqual({
      src: preview.src,
      size: null,
    })
  })

  test('プレビューを取り消すと保存済みの画像と寸法に戻る', () => {
    expect(resolveEditorImage(null, saved)).toEqual({
      src: '/api/images/diaries/abc/saved.jpg',
      size: { width: 1200, height: 900 },
    })
  })

  test('保存済みの画像に寸法が無ければ寸法なし', () => {
    expect(resolveEditorImage(null, { ...saved, size: null })).toEqual({
      src: '/api/images/diaries/abc/saved.jpg',
      size: null,
    })
  })

  test('画像が無ければ src も寸法も無い', () => {
    expect(resolveEditorImage(null, null)).toEqual({ src: null, size: null })
  })
})
