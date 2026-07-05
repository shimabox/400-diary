import { MAX_BODY_LENGTH } from './constants'
import { MOODS, type MoodKey } from './mood'

// TypeScript の型は c.req.json<T>() のキャストにすぎずランタイムでは何も守らない。
// API 入力の境界で実際の値を検証するためのユーティリティ群。

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/
const DIARY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MOOD_KEYS: readonly string[] = MOODS.map((mood) => mood.key)

/** background_color は OGP SVG に直接補間されるため #RRGGBB 形式のみ許可する */
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_PATTERN.test(v)
}

/**
 * "YYYY-MM-DD" かつ実在する日付か。
 * 例えば "2026-02-30" は正規表現には一致するが、Date にすると 3/2 に繰り上がるため
 * 年月日を再取得して一致するか確認する。
 */
export function isDiaryDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DIARY_DATE_PATTERN.test(v)) return false

  const [year, month, day] = v.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

export function isImageLayout(v: unknown): v is 'left' | 'right' {
  return v === 'left' || v === 'right'
}

/** mood は app/lib/mood.ts の MOODS が持つキーか null のみ許可する */
export function isMood(v: unknown): v is MoodKey | null {
  return v === null || (typeof v === 'string' && MOOD_KEYS.includes(v))
}

export function isImageCoord(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v))
}

export type DiaryInput = {
  body?: string
  diary_date?: string
  background_color?: string
  image_layout?: 'left' | 'right'
  mood?: string | null
  image_x?: number | null
  image_y?: number | null
}

export type ValidateDiaryInputOptions = {
  /** POST では本文必須。PUT は部分更新なので省略可 */
  requireBody?: boolean
  /** POST では日付必須。PUT は部分更新なので省略可 */
  requireDate?: boolean
}

export type ValidationResult =
  | { ok: true; value: DiaryInput }
  | { ok: false; error: string }

/**
 * 日記の作成・更新入力をまとめて検証する。
 * PUT の部分更新（フィールドが undefined なら更新しない）という既存挙動を壊さないよう、
 * 返す value にはリクエストに含まれていたキーのみを詰める（未指定キーは含めない）。
 */
export function validateDiaryInput(
  json: unknown,
  options: ValidateDiaryInputOptions = {},
): ValidationResult {
  const { requireBody = false, requireDate = false } = options

  if (typeof json !== 'object' || json === null) {
    return { ok: false, error: 'リクエストの形式が不正です' }
  }
  const input = json as Record<string, unknown>

  if (requireBody && input.body === undefined) {
    return { ok: false, error: '本文を入力してください' }
  }
  if (input.body !== undefined) {
    if (typeof input.body !== 'string' || input.body.length === 0) {
      return { ok: false, error: '本文を入力してください' }
    }
    if (input.body.length > MAX_BODY_LENGTH) {
      return {
        ok: false,
        error: `本文は${MAX_BODY_LENGTH}文字以内で入力してください`,
      }
    }
  }

  if (requireDate && input.diary_date === undefined) {
    return { ok: false, error: '日付を入力してください' }
  }
  if (input.diary_date !== undefined && !isDiaryDate(input.diary_date)) {
    return { ok: false, error: '日付の形式が不正です' }
  }

  // 空文字は「未指定として扱う」既存の POST 挙動(background_color || randomPastelColor())
  // に合わせ、フォーマット検証の対象外にする
  if (
    input.background_color !== undefined &&
    input.background_color !== '' &&
    !isHexColor(input.background_color)
  ) {
    return { ok: false, error: '背景色は #RRGGBB 形式で入力してください' }
  }

  if (input.image_layout !== undefined && !isImageLayout(input.image_layout)) {
    return { ok: false, error: '画像レイアウトの指定が不正です' }
  }

  if ('mood' in input && !isMood(input.mood)) {
    return { ok: false, error: '気分の指定が不正です' }
  }

  if ('image_x' in input && !isImageCoord(input.image_x)) {
    return { ok: false, error: '画像位置の指定が不正です' }
  }
  if ('image_y' in input && !isImageCoord(input.image_y)) {
    return { ok: false, error: '画像位置の指定が不正です' }
  }

  const value: DiaryInput = {}
  if (input.body !== undefined) value.body = input.body as string
  if (input.diary_date !== undefined) {
    value.diary_date = input.diary_date as string
  }
  if (input.background_color !== undefined && input.background_color !== '') {
    value.background_color = input.background_color as string
  }
  if (input.image_layout !== undefined) {
    value.image_layout = input.image_layout as 'left' | 'right'
  }
  if ('mood' in input) value.mood = input.mood as string | null
  if ('image_x' in input) value.image_x = input.image_x as number | null
  if ('image_y' in input) value.image_y = input.image_y as number | null

  return { ok: true, value }
}
