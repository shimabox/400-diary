/** 日記本文の最大文字数 */
export const MAX_BODY_LENGTH = 400

/** 画像の最大サイズ (bytes) */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/** 画像表示倍率の下限。これ未満はタップ・視認が困難になる */
export const IMAGE_SCALE_MIN = 0.5

/** 画像表示倍率の上限。これ超はテキストの回り込み先がなくなりレイアウトが破綻する */
export const IMAGE_SCALE_MAX = 1.5

/**
 * 画像回転角(度)の範囲。スクラップ帳に写真を斜めに貼る程度の傾きに留める。
 * 回り込みは回転後の外接矩形で近似するため、角度が大きいほど角の空白が目立つ
 */
export const IMAGE_ROTATION_MIN = -15
export const IMAGE_ROTATION_MAX = 15

/** アプリケーション名のデフォルト値 */
export const DEFAULT_APP_NAME = '400字日記'
