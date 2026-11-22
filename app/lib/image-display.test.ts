import { describe, expect, test } from 'vitest'
import {
  deriveImageDisplay,
  EMPTY_IMAGE_LOAD_RECORD,
  FAILURE_MARK_MAX_SIZE,
  failureMarkSize,
  type ImageLoadRecord,
  readImageElementResult,
  recordImageFailed,
  recordImageLoaded,
  shouldRevealOnLoad,
  trackImageSrc,
} from './image-display'

const A = '/api/images/diaries/abc/a.jpg'
const B = 'data:image/webp;base64,BBBB'
const C = '/api/images/diaries/abc/c.jpg'
const D = 'data:image/webp;base64,DDDD'

const size = (src: string) => ({ src, width: 1200, height: 900 })

/** FlowText の render と同じく、記録をいまの src に合わせてから見せ方を決める */
function display(record: ImageLoadRecord, src: string, frameReady = true) {
  return deriveImageDisplay(src, trackImageSrc(record, src), frameReady)
}

/**
 * FlowText と同じ手順で、src の img の読み込みが終わったときの記録を作る。
 * いまの表示で台紙が見えていたかどうかでフェードを決める
 */
function load(
  record: ImageLoadRecord,
  src: string,
  frameReady = true,
): ImageLoadRecord {
  const tracked = trackImageSrc(record, src)
  const shown = deriveImageDisplay(src, tracked, frameReady)
  return recordImageLoaded(tracked, size(src), shouldRevealOnLoad(shown))
}

/** FlowText と同じ手順で、src の img の読み込みが失敗したときの記録を作る */
function fail(record: ImageLoadRecord, src: string): ImageLoadRecord {
  return recordImageFailed(trackImageSrc(record, src), src)
}

/** src を設定しただけで、まだ読み込みの結果が届いていない記録を作る */
const pass = (record: ImageLoadRecord, src: string) =>
  trackImageSrc(record, src)

describe('deriveImageDisplay: いまの src の状態', () => {
  test('読み込み前は「待ち」で、台紙だけを見せて img は透明にする', () => {
    expect(display(EMPTY_IMAGE_LOAD_RECORD, A)).toEqual({
      status: 'waiting',
      image: 'transparent',
      mat: 'waiting',
    })
  })

  test('いまの src の読み込みが終わると「表示」になる', () => {
    const record = load(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(record, A)?.status).toBe('shown')
  })

  test('いまの src が失敗すると「失敗」で、台紙を残して img の描画を隠す', () => {
    const record = fail(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(record, A)).toEqual({
      status: 'failed',
      image: 'failed',
      mat: 'failed',
    })
  })

  test('前の src の失敗は、いまの src の状態に使わない', () => {
    const record = fail(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(record, C)?.status).toBe('waiting')
  })

  test('前の src の読み込みは、いまの src の状態に使わない', () => {
    const record = load(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(record, C)?.status).toBe('waiting')
  })

  test('画像が無ければ枠も無い', () => {
    expect(deriveImageDisplay(null, EMPTY_IMAGE_LOAD_RECORD, true)).toBeNull()
  })

  test('枠の大きさが決まるまでは台紙を出さない（寸法が分からない画像も同じ）', () => {
    expect(display(EMPTY_IMAGE_LOAD_RECORD, A, false)?.mat).toBe('none')
    const failed = fail(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(failed, A, false)?.mat).toBe('none')
  })

  test('同じ src の読み込みが終われば、失敗の記録より読み込みを使う', () => {
    const record = load(fail(EMPTY_IMAGE_LOAD_RECORD, A), A)
    expect(record.result).toBe('loaded')
    expect(display(record, A)?.status).toBe('shown')
  })

  test('記録がいまの src に合っていなければ、結果を使わない', () => {
    // trackImageSrc を通さずに、前の src の記録を渡した場合
    const record = fail(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(deriveImageDisplay(C, record, true)?.status).toBe('waiting')
  })
})

describe('trackImageSrc', () => {
  test('src が変わらなければ同じ記録を返す（render 中に繰り返し切り替えない）', () => {
    const record = load(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(trackImageSrc(record, A)).toBe(record)
    expect(trackImageSrc(EMPTY_IMAGE_LOAD_RECORD, null)).toBe(
      EMPTY_IMAGE_LOAD_RECORD,
    )
  })

  test('src が変わったら結果だけを捨て、枠の表示履歴は残す', () => {
    const record = pass(load(EMPTY_IMAGE_LOAD_RECORD, A), B)
    expect(record.trackedSrc).toBe(B)
    expect(record.result).toBeNull()
    expect(record.shown).toBe(true)
  })

  test('src が null になったら（画像を削除したら）履歴も終わる', () => {
    const record = trackImageSrc(load(EMPTY_IMAGE_LOAD_RECORD, A), null)
    expect(record).toBe(EMPTY_IMAGE_LOAD_RECORD)
  })
})

describe('deriveImageDisplay: フェード', () => {
  test('台紙が見えている間に届いた画像は、フェードで現し台紙も同時に消す', () => {
    const record = load(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(record, A)).toEqual({
      status: 'shown',
      image: 'revealing',
      mat: 'leaving',
    })
  })

  test('ハイドレーションの時点で読み込み済みなら、台紙もフェードも見せない', () => {
    // ref callback で読み込み済みと分かった場合。台紙はまだ見えていない
    const record = recordImageLoaded(
      pass(EMPTY_IMAGE_LOAD_RECORD, A),
      size(A),
      false,
    )
    expect(display(record, A)).toEqual({
      status: 'shown',
      image: 'visible',
      mat: 'none',
    })
  })

  test('枠の大きさが決まる前（台紙が見えていない間）に届いた画像はフェードしない', () => {
    const record = load(EMPTY_IMAGE_LOAD_RECORD, A, false)
    expect(display(record, A)).toEqual({
      status: 'shown',
      image: 'visible',
      mat: 'none',
    })
  })

  test('同じ画像の読み込みがもう一度記録されても、始めたフェードは止めない', () => {
    const revealing = load(EMPTY_IMAGE_LOAD_RECORD, A)
    const again = recordImageLoaded(revealing, size(A), false)
    expect(display(again, A)?.image).toBe('revealing')
  })
})

describe('deriveImageDisplay: 表示済みの枠での src の変化', () => {
  test('A を表示済みの枠で src が B に変わったときは、台紙を出さず img も見せたまま', () => {
    const record = load(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(record, B)).toEqual({
      status: 'waiting',
      image: 'visible',
      mat: 'none',
    })
    // B が届いてもフェードしない
    const loadedB = load(record, B)
    expect(display(loadedB, B)).toEqual({
      status: 'shown',
      image: 'visible',
      mat: 'none',
    })
  })

  test('A が待ちのまま src が B に変わったときは、B でも待ちを続ける（台紙を出す）', () => {
    const waitingA = pass(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(display(waitingA, B)).toEqual({
      status: 'waiting',
      image: 'transparent',
      mat: 'waiting',
    })
    // B が届いたらフェードで現す
    const record = load(waitingA, B)
    expect(display(record, B)?.image).toBe('revealing')
  })

  test('表示済みの A → 未読込の B → C と変わっても、台紙を出さない', () => {
    const record = load(EMPTY_IMAGE_LOAD_RECORD, A)
    // B は読み込みが終わらないまま通り過ぎる
    const passedB = pass(record, B)
    expect(display(passedB, B)?.mat).toBe('none')
    expect(display(passedB, C)).toEqual({
      status: 'waiting',
      image: 'visible',
      mat: 'none',
    })
    expect(display(load(passedB, C), C)?.mat).toBe('none')
  })

  test('表示済みの枠でも、変わった先の画像が失敗すれば「失敗」の表示になる', () => {
    const record = fail(load(EMPTY_IMAGE_LOAD_RECORD, A), B)
    expect(display(record, B)).toEqual({
      status: 'failed',
      image: 'failed',
      mat: 'failed',
    })
  })

  test('画像を削除したあと（src が null を挟んだあと）に追加した画像は「待ち」から始まる', () => {
    const shown = load(EMPTY_IMAGE_LOAD_RECORD, A)
    expect(deriveImageDisplay(null, shown, true)).toBeNull()
    // src が null になった render で、記録は空に戻る
    const afterRemoval = trackImageSrc(shown, null)
    expect(display(afterRemoval, C)).toEqual({
      status: 'waiting',
      image: 'transparent',
      mat: 'waiting',
    })
    expect(display(load(afterRemoval, C), C)?.image).toBe('revealing')
  })
})

describe('src が切り替わったときの、前の src の結果', () => {
  test('A 失敗 → B 表示 → A に戻ったときは、過去の A の失敗を使わない', () => {
    const failedA = fail(EMPTY_IMAGE_LOAD_RECORD, A)
    const shownB = load(failedA, B)
    expect(display(shownB, B)?.status).toBe('shown')
    // A に戻った直後: 読み込み中。表示済みの枠なので台紙を出さず、B も消さない
    const backToA = pass(shownB, A)
    expect(display(backToA, A)).toEqual({
      status: 'waiting',
      image: 'visible',
      mat: 'none',
    })
    // 戻ったあとの A が読み込めれば表示、失敗すれば失敗の表示
    expect(display(load(backToA, A), A)).toEqual({
      status: 'shown',
      image: 'visible',
      mat: 'none',
    })
    expect(display(fail(backToA, A), A)?.status).toBe('failed')
  })

  test('A 失敗 → 未読込の B → A に戻ったときも、過去の A の失敗を使わない', () => {
    const backToA = pass(pass(fail(EMPTY_IMAGE_LOAD_RECORD, A), B), A)
    expect(display(backToA, A)?.status).toBe('waiting')
  })

  test('A 表示 → B 失敗 → C のときは、C が届くまで img を透明のままにし、台紙は出さない', () => {
    const failedB = fail(load(EMPTY_IMAGE_LOAD_RECORD, A), B)
    const waitingC = pass(failedB, C)
    expect(display(waitingC, C)).toEqual({
      status: 'waiting',
      image: 'transparent',
      mat: 'none',
    })
    // C が届いたら、フェードせずに表示する
    expect(display(load(waitingC, C), C)).toEqual({
      status: 'shown',
      image: 'visible',
      mat: 'none',
    })
    // C も失敗したら失敗の表示
    expect(display(fail(waitingC, C), C)).toEqual({
      status: 'failed',
      image: 'failed',
      mat: 'failed',
    })
  })

  test('失敗のあと、届かないまま次の画像に替わっても、届くまで img を透明のままにする', () => {
    const failedB = fail(load(EMPTY_IMAGE_LOAD_RECORD, A), B)
    const waitingD = pass(pass(failedB, C), D)
    expect(display(waitingD, D)?.image).toBe('transparent')
    // D が届けば、次からの切り替えではまた img を見せたまま置き換える
    const loadedD = load(waitingD, D)
    expect(display(loadedD, A)?.image).toBe('visible')
  })
})

describe('外した img や前の src から遅れて届いた結果', () => {
  test('画像を削除したあとに届いた結果は記録しない（新しい枠は「待ち」から始まる）', () => {
    const removed = trackImageSrc(pass(EMPTY_IMAGE_LOAD_RECORD, A), null)
    // 外した img の A の load / error があとから届く
    expect(recordImageLoaded(removed, size(A), false)).toBe(removed)
    expect(recordImageFailed(removed, A)).toBe(removed)
    // 次に追加した B は、まだ何も表示していない枠として台紙を出す
    expect(display(removed, B)).toEqual({
      status: 'waiting',
      image: 'transparent',
      mat: 'waiting',
    })
  })

  test('前の src の結果があとから届いても、いまの src の記録にしない', () => {
    const waitingB = pass(pass(EMPTY_IMAGE_LOAD_RECORD, A), B)
    expect(recordImageLoaded(waitingB, size(A), false)).toBe(waitingB)
    expect(recordImageFailed(waitingB, A)).toBe(waitingB)
    expect(display(waitingB, B)?.mat).toBe('waiting')
  })
})

describe('shouldRevealOnLoad', () => {
  test('台紙を見せている「待ち」のときだけフェードする', () => {
    expect(
      shouldRevealOnLoad({
        status: 'waiting',
        image: 'transparent',
        mat: 'waiting',
      }),
    ).toBe(true)
    expect(
      shouldRevealOnLoad({ status: 'waiting', image: 'visible', mat: 'none' }),
    ).toBe(false)
    expect(
      shouldRevealOnLoad({
        status: 'waiting',
        image: 'transparent',
        mat: 'none',
      }),
    ).toBe(false)
    expect(
      shouldRevealOnLoad({ status: 'shown', image: 'visible', mat: 'none' }),
    ).toBe(false)
    expect(shouldRevealOnLoad(null)).toBe(false)
  })
})

describe('readImageElementResult', () => {
  test('src の無い img（complete が true、naturalWidth が 0）を失敗として扱わない', () => {
    expect(
      readImageElementResult({ src: null, complete: true, naturalWidth: 0 }),
    ).toBeNull()
    expect(
      readImageElementResult({ src: '', complete: true, naturalWidth: 0 }),
    ).toBeNull()
  })

  test('読み込み中（complete が false）は結果なし', () => {
    expect(
      readImageElementResult({ src: A, complete: false, naturalWidth: 0 }),
    ).toBeNull()
  })

  test('src が設定済みで読み込みが終わっていれば、その src の成否を返す', () => {
    expect(
      readImageElementResult({ src: A, complete: true, naturalWidth: 1200 }),
    ).toEqual({ src: A, result: 'loaded' })
    expect(
      readImageElementResult({ src: A, complete: true, naturalWidth: 0 }),
    ).toEqual({ src: A, result: 'failed' })
  })
})

describe('failureMarkSize', () => {
  test('ふつうの大きさの台紙では上限の大きさ', () => {
    expect(failureMarkSize({ width: 264, height: 198 })).toBe(
      FAILURE_MARK_MAX_SIZE,
    )
  })

  test('台紙が小さいときは短い辺の 6 割に抑えてはみ出さない', () => {
    expect(failureMarkSize({ width: 300, height: 30 })).toBe(18)
    expect(failureMarkSize({ width: 0, height: 0 })).toBe(0)
  })
})
