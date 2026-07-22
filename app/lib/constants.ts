/** 日記本文の最大文字数 */
export const MAX_BODY_LENGTH = 400

/** 画像の最大サイズ (bytes) */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/** 画像表示倍率の下限。これ未満はタップ・視認が困難になる */
export const IMAGE_SCALE_MIN = 0.5

/** 画像表示倍率の上限。これ超はテキストの回り込み先がなくなりレイアウトが破綻する */
export const IMAGE_SCALE_MAX = 1.5

/** アプリケーション名のデフォルト値 */
export const DEFAULT_APP_NAME = '400字日記'
