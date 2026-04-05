import type { D1Database } from '@cloudflare/workers-types/latest'
import { nanoid } from 'nanoid'

export type Diary = {
  id: string
  body: string
  image_key: string | null
  image_layout: 'left' | 'right'
  background_color: string
  mood: string | null
  published_at: string | null
  diary_date: string
  created_at: string
  updated_at: string
}

export async function createDiary(
  db: D1Database,
  params: {
    body: string
    diary_date: string
    background_color: string
    image_layout?: 'left' | 'right'
    mood?: string | null
    published_at?: string | null
  },
): Promise<Diary> {
  const id = nanoid(12)
  const {
    body,
    diary_date,
    background_color,
    image_layout,
    mood,
    published_at,
  } = params

  await db
    .prepare(
      `INSERT INTO diaries (id, body, background_color, image_layout, mood, published_at, diary_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      body,
      background_color,
      image_layout ?? 'left',
      mood ?? null,
      published_at ?? null,
      diary_date,
    )
    .run()

  return (await getDiary(db, id))!
}

export async function getDiary(
  db: D1Database,
  id: string,
): Promise<Diary | null> {
  return await db
    .prepare('SELECT * FROM diaries WHERE id = ?')
    .bind(id)
    .first<Diary>()
}

export async function listDiaries(db: D1Database): Promise<Diary[]> {
  const { results } = await db
    .prepare('SELECT * FROM diaries ORDER BY diary_date DESC')
    .all<Diary>()
  return results
}

export async function updateDiary(
  db: D1Database,
  id: string,
  params: {
    body?: string
    diary_date?: string
    background_color?: string
    image_layout?: 'left' | 'right'
    mood?: string | null
    published_at?: string | null
    image_key?: string | null
  },
): Promise<Diary | null> {
  const existing = await getDiary(db, id)
  if (!existing) return null

  const setClauses: string[] = ["updated_at = datetime('now')"]
  const values: unknown[] = []

  if (params.body !== undefined) {
    setClauses.push('body = ?')
    values.push(params.body)
  }
  if (params.diary_date !== undefined) {
    setClauses.push('diary_date = ?')
    values.push(params.diary_date)
  }
  if (params.background_color !== undefined) {
    setClauses.push('background_color = ?')
    values.push(params.background_color)
  }
  if (params.image_layout !== undefined) {
    setClauses.push('image_layout = ?')
    values.push(params.image_layout)
  }
  if ('mood' in params) {
    setClauses.push('mood = ?')
    values.push(params.mood ?? null)
  }
  if ('published_at' in params) {
    setClauses.push('published_at = ?')
    values.push(params.published_at ?? null)
  }
  if ('image_key' in params) {
    setClauses.push('image_key = ?')
    values.push(params.image_key ?? null)
  }

  values.push(id)

  await db
    .prepare(`UPDATE diaries SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()

  return await getDiary(db, id)
}

export async function listDiaryCalendarEntries(
  db: D1Database,
  year: number,
): Promise<{ id: string; diary_date: string; mood: string | null }[]> {
  const { results } = await db
    .prepare(
      'SELECT id, diary_date, mood FROM diaries WHERE diary_date >= ? AND diary_date < ? ORDER BY diary_date',
    )
    .bind(`${year}-01-01`, `${year + 1}-01-01`)
    .all<{ id: string; diary_date: string; mood: string | null }>()
  return results
}

export async function deleteDiary(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM diaries WHERE id = ?')
    .bind(id)
    .run()
  return result.meta.changes > 0
}
