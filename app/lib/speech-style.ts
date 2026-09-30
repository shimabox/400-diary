import { getMoodByKey, type MoodKey } from './mood'

// 読み上げの話し方の指示文。サーバ（生成・キャッシュキー）と編集画面の確認ダイアログの
// 両方から参照するため、R2 や crypto に依存しない独立したモジュールに置く。

const SPEECH_STYLE_PREFIX = '日記を読み聞かせるように、'

/** 気分ごとに指示文の後半に続ける文。気分の種類を増やしたら型エラーで気付けるよう MoodKey で網羅する */
export const SPEECH_STYLE_BY_MOOD: Record<MoodKey, string> = {
  happy: '明るく弾んだ声で',
  fun: '楽しそうに、はずむように',
  calm: '落ち着いて、やわらかく',
  sad: '静かに、少しゆっくり、悲しそうに',
  angry: '少し強い口調で、感情を込めて',
  anxious: '不安そうに、ためらいがちに',
}

/** 気分が無い・不明なときの後半の文 */
export const DEFAULT_SPEECH_STYLE = '落ち着いて自然なペースで'

export type SpeechStyle = {
  /** Gemini に渡す指示文の全文 */
  instruction: string
  /** 画面に出す話し方（指示文の後半） */
  label: string
  /** 話し方の元になった気分の表示名。気分なし・不明なら null */
  moodLabel: string | null
}

/** 保存済みの気分から話し方を決める */
export function speechStyleForMood(mood: string | null): SpeechStyle {
  const found = getMoodByKey(mood)
  const label = found ? SPEECH_STYLE_BY_MOOD[found.key] : DEFAULT_SPEECH_STYLE
  return {
    instruction: `${SPEECH_STYLE_PREFIX}${label}`,
    label,
    moodLabel: found?.label ?? null,
  }
}
