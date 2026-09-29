// 編集画面の音声操作の表示を、props と state から render 中に導出するための純関数。
// サーバでしか計算できない「音声が今の日記に合っているか」（声 ID を使う）は、
// ページを開いた時点の結果だけを props で受け取り、その後の保存・生成は
// 「音声がどの本文と気分から作られたか」を覚えておいて比べる。
// 公開版の音声のキーも props（公開後は公開 API の応答）で受け取り、下書きの音声と比べる。

/** 音声が作られた元の本文と気分 */
export type SpeechBasis = { body: string; mood: string | null }

export type SpeechState = {
  /** 下書き側の音声の R2 キー。音声が無ければ null */
  key: string | null
  /** key の音声が合っている本文と気分。古い・不明なら null */
  basis: SpeechBasis | null
}

export function initialSpeechState(params: {
  key: string | null
  /** サーバで計算した「key が保存済みの本文と気分に合っているか」 */
  matches: boolean
  body: string
  mood: string | null
}): SpeechState {
  const { key, matches, body, mood } = params
  return {
    key,
    basis: key && matches ? { body, mood } : null,
  }
}

export const GENERATE_LABEL = '音声を作る'
export const REGENERATE_LABEL = '音声を作り直す'
export const SAVE_FIRST_NOTICE = '保存してから作ってください'
export const STALE_NOTICE = '本文や気分が変わったため、音声が古くなっています'
export const GENERATING_NOTICE = '作成中…（1 分ほどかかることがあります）'
export const PUBLISH_TO_REFLECT_NOTICE =
  '公開ページに反映するには「公開する」を押してください'

export type SpeechView = {
  hasSpeech: boolean
  isStale: boolean
  /** 公開すれば公開版に引き継がれる音声が、まだ公開版に入っていないか */
  awaitingPublish: boolean
  /** 「音声を作る」「音声を作り直す」を出すか */
  showGenerate: boolean
  generateLabel: string
  generateDisabled: boolean
  deleteDisabled: boolean
  /** 状態に応じた短い案内文 */
  notice: string | null
}

export function deriveSpeechView(params: {
  state: SpeechState
  /** API キーと声 ID が設定されていて音声を作れるか */
  available: boolean
  /** 最後に保存した本文と気分。未保存の新規日記なら null */
  saved: SpeechBasis | null
  /** 編集中の本文と気分 */
  current: SpeechBasis
  /** 公開版の音声のキー。未公開の日記なら undefined */
  publishedKey: string | null | undefined
  generating: boolean
  deleting: boolean
  error: string
}): SpeechView {
  const {
    state,
    available,
    saved,
    current,
    publishedKey,
    generating,
    deleting,
    error,
  } = params
  const hasSpeech = state.key !== null
  const isFresh =
    hasSpeech &&
    state.basis !== null &&
    saved !== null &&
    state.basis.body === saved.body &&
    state.basis.mood === saved.mood
  const isStale = hasSpeech && !isFresh
  // 音声は保存済みの本文と気分から作るので、それらに未保存の変更があれば作らせない
  const hasUnsavedChanges =
    saved === null || saved.body !== current.body || saved.mood !== current.mood
  const showGenerate = available && (!hasSpeech || isStale)
  // 公開は保存してから行うので、未保存の変更があると公開時に音声が古くなり引き継がれない。
  // 引き継がれる場合だけ「公開する」を促す
  const awaitingPublish =
    publishedKey !== undefined &&
    isFresh &&
    !hasUnsavedChanges &&
    state.key !== publishedKey

  let notice: string | null = null
  if (generating) {
    notice = GENERATING_NOTICE
  } else if (error) {
    notice = error
  } else if (showGenerate && hasUnsavedChanges) {
    notice = SAVE_FIRST_NOTICE
  } else if (available && isStale) {
    notice = STALE_NOTICE
  } else if (awaitingPublish) {
    notice = PUBLISH_TO_REFLECT_NOTICE
  }

  return {
    hasSpeech,
    isStale,
    awaitingPublish,
    showGenerate,
    generateLabel: hasSpeech ? REGENERATE_LABEL : GENERATE_LABEL,
    generateDisabled: generating || deleting || hasUnsavedChanges,
    deleteDisabled: generating || deleting,
    notice,
  }
}

/**
 * 編集画面で下書きの音声を再生する URL。作り直すとキー（本文などのハッシュ）が
 * 変わるので、クエリにキー由来の値を載せて古い音声を再生しないようにする。
 */
export function speechDraftSrc(diaryId: string, key: string): string {
  const version = (key.split('/').at(-1) ?? '')
    .replace(/\.wav$/, '')
    .slice(0, 16)
  return `/api/speech/${encodeURIComponent(diaryId)}/draft?v=${version}`
}
