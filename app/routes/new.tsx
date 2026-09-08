import { createRoute } from '~/factory'
import VerticalEditor from '../islands/vertical-editor'
import { randomPastelColor } from '../lib/colors'
import { DEFAULT_APP_NAME } from '../lib/constants'
import { getDiaryIdByDate } from '../lib/db'
import { toLocalDateString } from '../lib/format'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || DEFAULT_APP_NAME
  if (!c.get('isAuthenticated')) {
    return c.redirect('/')
  }

  const today = toLocalDateString()
  const existingId = await getDiaryIdByDate(c.env.DB, today)
  if (existingId) return c.redirect(`/edit/${encodeURIComponent(existingId)}`)
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
        <VerticalEditor
          title="日記を書く"
          initialDate={today}
          initialColor={color}
        />
      </div>
    </div>,
    { title: `日記を書く — ${appName}` },
  )
})
