import { createRoute } from '~/factory'
import VerticalEditor from '../islands/vertical-editor'
import { randomPastelColor } from '../lib/colors'

export default createRoute((c) => {
  const today = new Date().toISOString().split('T')[0]
  const color = randomPastelColor()

  return c.render(
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <VerticalEditor
        title="日記を書く"
        initialDate={today}
        initialColor={color}
      />
    </div>,
    { title: '日記を書く — 256日記' },
  )
})
