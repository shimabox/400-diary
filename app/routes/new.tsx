import { createRoute } from '~/factory'
import VerticalEditor from '../islands/vertical-editor'
import { randomPastelColor } from '../lib/colors'
import { DEFAULT_APP_NAME } from '../lib/constants'
import { findFirstFreeDiaryDate, getDiaryIdByDate } from '../lib/db'
import {
  addDaysToDateString,
  formatDiaryDate,
  toLocalDateString,
} from '../lib/format'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || DEFAULT_APP_NAME
  if (!c.get('isAuthenticated')) {
    return c.redirect('/')
  }

  const today = toLocalDateString()
  // 今日の日記があっても編集画面へは送らない。編集画面で日付を変えると今日の日記を
  // 書き換えてしまうため、新規エディタのまま次に空いている日を初期値にする
  const todayDiaryId = await getDiaryIdByDate(c.env.DB, today)
  const initialDate = todayDiaryId
    ? await findFirstFreeDiaryDate(c.env.DB, addDaysToDateString(today, 1))
    : today
  const color = randomPastelColor()

  return c.render(
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div style={{ maxWidth: '960px', width: '100%' }}>
        {todayDiaryId && (
          <p
            style={{
              marginTop: '1rem',
              fontSize: '0.9rem',
              color: 'var(--fg-muted)',
            }}
          >
            今日の日記はすでにあるため、{formatDiaryDate(initialDate)}{' '}
            の日記として書きはじめます。{' '}
            <a
              href={`/edit/${encodeURIComponent(todayDiaryId)}`}
              style={{ textDecoration: 'underline' }}
            >
              今日の日記を編集する
            </a>
          </p>
        )}
        <VerticalEditor
          title="日記を書く"
          initialDate={initialDate}
          initialColor={color}
        />
      </div>
    </div>,
    { title: `日記を書く — ${appName}` },
  )
})
