import { createRoute } from '~/factory'
import { getImage } from '../../../lib/storage'

export const GET = createRoute(async (c) => {
  const prefix = '/api/images/'
  const key = new URL(c.req.url).pathname.slice(prefix.length)
  const bucket = c.env.BUCKET

  const result = await getImage(bucket, key)
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
