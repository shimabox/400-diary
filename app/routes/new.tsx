import { createRoute } from '~/factory'
import VerticalEditor from '../islands/vertical-editor'
import { randomPastelColor } from '../lib/colors'

export default createRoute((c) => {
  const appName = c.env.APP_NAME || '400字日記'
  if (!c.get('isAuthenticated')) {
    return c.redirect('/')
  }

  const today = new Date().toISOString().split('T')[0]
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
