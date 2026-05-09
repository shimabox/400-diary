import { createRoute } from '~/factory'
import { getAudio } from '../../../lib/storage'

export const GET = createRoute(async (c) => {
  const prefix = '/api/audio/'
  const key = new URL(c.req.url).pathname.slice(prefix.length)

  if (!/^diaries\/[^/]+\/audio\/[^/]+$/.test(key)) {
    return c.body(null, 404)
  }

  const result = await getAudio(c.env.BUCKET, key)
  if (!result) {
    return c.body(null, 404)
  }

  return new Response(result.body, {
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
