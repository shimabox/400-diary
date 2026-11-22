import type { LoadedImageSize } from './image-dimensions'
import type { ImageSize } from './image-layout'

/**
 * 日記の画像の枠（FlowText）で、画像が届くまでの台紙・届いたときのフェード・
 * 読み込めなかったときの印をどう見せるかを決める。
 *
 * 状態は props（いまの src）と、読み込みの結果を記録した state から render 中に
 * 導出する。記録は、枠の表示履歴（その枠で写真を表示済みか）と、いまの src を
 * 設定してからの読み込みの結果に分けて持つ。src が切り替わったら結果だけを捨て、
 * 前の画像の結果（とくに失敗）で、いまの画像の表示が決まらないようにする。
 */

/** いまの src の読み込みの状態 */
export type ImageLoadStatus = 'waiting' | 'shown' | 'failed'

/**
 * 枠の中の img の見せ方。
 * - transparent: 不透明度 0（台紙だけを見せる。要素の矩形は保つ）
 * - visible: そのまま見せる
 * - revealing: 不透明度 1 にして、フェードの transition を付ける
 * - failed: 描画を隠す（壊れた画像のアイコンや alt の文字を見せない。矩形は保つ）
 */
export type ImageAppearance = 'transparent' | 'visible' | 'revealing' | 'failed'

/**
 * 台紙の見せ方。
 * - none: 出さない
 * - waiting: 画像が届くまで見せる
 * - leaving: 画像のフェードと同時に消していく（終わったあとは見えない）
 * - failed: 読み込めなかったので残し、印を重ねる
 */
export type ImageMatAppearance = 'none' | 'waiting' | 'leaving' | 'failed'

export type ImageDisplay = {
  status: ImageLoadStatus
  image: ImageAppearance
  mat: ImageMatAppearance
}

/**
 * 枠で記録した読み込みの結果。枠の表示履歴（shown、concealed）と、いまの src
 * （trackedSrc）を設定してからの読み込みの結果（result、reveal）を分けて持つ。
 * src が切り替わったら trackImageSrc で結果だけを捨て、履歴は残す
 */
export type ImageLoadRecord = {
  /**
   * 最後に読み込みが終わった画像の実寸と src。配置の計算にだけ使う
   * （chooseLayoutImageSize が、いまの src と同じ画像のときだけ使う）
   */
  measured: LoadedImageSize | null
  /**
   * 枠の表示履歴。画像が無い状態（src が null）から途切れずに続く間に、
   * どれかの画像の読み込みが終わって表示したことがあれば true
   */
  shown: boolean
  /**
   * 直前の画像の失敗で img の描画を隠したまま、次の画像に切り替わったら true。
   * 次の画像の読み込みが終わるまで img を透明のままにする（ブラウザによっては、
   * 次の画像が届くまで失敗した画像の壊れた画像のアイコンや alt を描き続けるため）
   */
  concealed: boolean
  /** result と reveal がどの src についての結果か（いまの src） */
  trackedSrc: string | null
  /** trackedSrc を設定してからの読み込みの結果。まだ分からなければ null */
  result: 'loaded' | 'failed' | null
  /** 台紙が見えている間に読み込みが終わったので、フェードで現す */
  reveal: boolean
}

/** 枠ができたとき・画像が無くなったときの記録（まだ何も表示していない） */
export const EMPTY_IMAGE_LOAD_RECORD: ImageLoadRecord = {
  measured: null,
  shown: false,
  concealed: false,
  trackedSrc: null,
  result: null,
  reveal: false,
}

/**
 * いまの src に合わせて記録を切り替える。src が変わらなければ同じ記録を返す。
 *
 * - src が変わったら、前の src の読み込みの結果は捨てる（同じ src に戻っても、
 *   前に失敗した・読み込めたという結果は使わず、戻ったあとの読み込みで決める）。
 *   枠の表示履歴は残すので、表示済みの枠では台紙を出さない
 * - 前の src の失敗で img を隠していたら、次の画像が届くまで隠したままにする
 * - src が null（画像を削除した）なら履歴も終わり、次に追加した画像は新しい枠
 *   として「待ち」から始まる
 */
export function trackImageSrc(
  record: ImageLoadRecord,
  src: string | null,
): ImageLoadRecord {
  if (record.trackedSrc === src) return record
  if (src === null) return EMPTY_IMAGE_LOAD_RECORD
  return {
    ...record,
    concealed: record.concealed || record.result === 'failed',
    trackedSrc: src,
    result: null,
    reveal: false,
  }
}

/**
 * 読み込みが終わった画像を記録する。reveal は、台紙が見えている間に届いたか
 * （shouldRevealOnLoad）。いまの src（trackedSrc）以外の画像の結果は記録しない
 * （前の src の結果が遅れて届いた場合や、画像を削除したあとに届いた場合）
 */
export function recordImageLoaded(
  record: ImageLoadRecord,
  loaded: LoadedImageSize,
  reveal: boolean,
): ImageLoadRecord {
  if (loaded.src !== record.trackedSrc) return record
  return {
    measured: loaded,
    shown: true,
    concealed: false,
    trackedSrc: record.trackedSrc,
    result: 'loaded',
    // 同じ画像の読み込みがもう一度記録されても、始めたフェードは止めない
    reveal: reveal || (record.result === 'loaded' && record.reveal),
  }
}

/**
 * 読み込みが失敗した画像を記録する。いまの src（trackedSrc）以外の画像の結果は
 * 記録しない
 */
export function recordImageFailed(
  record: ImageLoadRecord,
  src: string,
): ImageLoadRecord {
  if (src !== record.trackedSrc) return record
  return { ...record, result: 'failed', reveal: false }
}

/**
 * いまの src（currentSrc）について、画像・台紙の見せ方を決める。record は
 * trackImageSrc で currentSrc に合わせたもの（合っていなければ結果は使わない）。
 *
 * - 待ち: いまの src の読み込みが終わっておらず、失敗もしていない。まだ一度も
 *   画像を表示していない枠では台紙を見せて img は透明にする。表示済みの枠では
 *   台紙を出さず、img もそのまま見せる（ブラウザが表示中の画像を新しい画像に
 *   置き換えるのに任せ、編集中に画像が一瞬消えるちらつきを作らない）。ただし
 *   直前の画像の失敗で img を隠していたときは、届くまで img を透明のままにする
 *   （台紙は出さない）
 * - 表示: いまの src の読み込みが終わった。台紙が見えている間に届いたときだけ
 *   フェードで現し、台紙も同時に消す。それ以外（キャッシュ済み、表示済みの枠での
 *   差し替え）はすぐに見せる
 * - 失敗: いまの src の読み込みが失敗した。台紙を残し、img の描画は隠す
 *
 * 台紙は枠の大きさが決まっている（frameReady）ときだけ出す。寸法が分からない
 * 画像は読み込みが終わるまで枠が決まらないので、台紙は出ない。
 *
 * currentSrc が null（画像が無い）なら枠が無いので null を返す。
 */
export function deriveImageDisplay(
  currentSrc: string | null,
  record: ImageLoadRecord,
  frameReady: boolean,
): ImageDisplay | null {
  if (currentSrc === null) return null
  const mat = (m: ImageMatAppearance): ImageMatAppearance =>
    frameReady ? m : 'none'
  const result = record.trackedSrc === currentSrc ? record.result : null

  if (result === 'loaded') {
    return {
      status: 'shown',
      image: record.reveal ? 'revealing' : 'visible',
      mat: mat(record.reveal ? 'leaving' : 'none'),
    }
  }

  if (result === 'failed') {
    return { status: 'failed', image: 'failed', mat: mat('failed') }
  }

  if (record.shown) {
    return {
      status: 'waiting',
      image: record.concealed ? 'transparent' : 'visible',
      mat: 'none',
    }
  }
  return { status: 'waiting', image: 'transparent', mat: mat('waiting') }
}

/**
 * 読み込みが終わったときに、フェードで現すかどうか。台紙が見えていたとき
 * （まだ画像を表示していない枠で、枠の大きさが決まって台紙を出していたとき）
 * だけフェードする。台紙が見えていなかったのに現れ方だけ遅らせることはしない
 */
export function shouldRevealOnLoad(display: ImageDisplay | null): boolean {
  return display?.mat === 'waiting'
}

/** img 要素の、読み込みの結果に関わる値 */
export type ImageElementState = {
  /** src 属性の値。設定されていなければ null */
  src: string | null
  complete: boolean
  naturalWidth: number
}

/**
 * img 要素の今の値から、読み込みの結果が分かればその src と結果を返す。
 *
 * src 属性の無い img は complete が true で naturalWidth が 0 になるので、
 * src が設定されていない要素の値は、読み込みの結果として扱わない（失敗と
 * 取り違えない）。読み込み中（complete が false）も結果なし。
 */
export function readImageElementResult(
  el: ImageElementState,
): { src: string; result: 'loaded' | 'failed' } | null {
  if (el.src === null || el.src === '') return null
  if (!el.complete) return null
  return { src: el.src, result: el.naturalWidth > 0 ? 'loaded' : 'failed' }
}

/** 読み込めなかったときの印の大きさの上限（px） */
export const FAILURE_MARK_MAX_SIZE = 28

/**
 * 読み込めなかったときの印の大きさ（px）。台紙が小さいときは、台紙の短い辺の
 * 6 割に抑えてはみ出さないようにする
 */
export function failureMarkSize(imageSize: ImageSize): number {
  const fit = Math.floor(Math.min(imageSize.width, imageSize.height) * 0.6)
  return Math.max(0, Math.min(FAILURE_MARK_MAX_SIZE, fit))
}
