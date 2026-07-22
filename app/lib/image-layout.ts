export type ImageSize = {
  width: number
  height: number
}

// 倍率 1.0 のときの基準枠。自然サイズをこの枠に収めたサイズが倍率 1.0 の表示サイズになり、
// image_scale はそこへ乗算される（枠より小さい画像は自然サイズが基準）
export const IMAGE_BASE_MAX_WIDTH_PERCENT = 30
export const IMAGE_BASE_MAX_HEIGHT_PX = 256

/**
 * 画像の表示サイズ(imageSize)と回転後の外接矩形(frameSize)を導出する純粋関数。
 *
 * - imageSize: 自然サイズを基準枠(コンテナ幅30% / 高さ256px)に収めたサイズ × 倍率。
 *   基準枠より小さい画像でも倍率どおりに拡縮される
 * - frameSize: 回転した画像を包む外接矩形。回り込み・ドラッグ範囲・タップ領域の基準
 *
 * 最大倍率×回転では外接矩形がコンテナ(overflowY: hidden)を超えて画像が切れ得るため、
 * その場合は保存値(scale/rotation)を変えずに、両者をコンテナへ収まるサイズに追加補正する。
 */
export function computeImageFrame(
  naturalSize: ImageSize,
  containerSize: ImageSize,
  scale: number,
  rotation: number,
): { imageSize: ImageSize; frameSize: ImageSize } {
  const baseFit = Math.min(
    1,
    (containerSize.width * (IMAGE_BASE_MAX_WIDTH_PERCENT / 100)) /
      naturalSize.width,
    IMAGE_BASE_MAX_HEIGHT_PX / naturalSize.height,
  )
  const width = naturalSize.width * baseFit * scale
  const height = naturalSize.height * baseFit * scale

  const rad = (rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const frameWidth = width * cos + height * sin
  const frameHeight = width * sin + height * cos

  const containFit = Math.min(
    1,
    containerSize.width / frameWidth,
    containerSize.height / frameHeight,
  )
  return {
    imageSize: { width: width * containFit, height: height * containFit },
    frameSize: {
      width: frameWidth * containFit,
      height: frameHeight * containFit,
    },
  }
}
