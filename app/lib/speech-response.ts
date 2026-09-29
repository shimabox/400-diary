import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { parseRange } from './http-range'
import { SPEECH_MIME_TYPE } from './speech'

/**
 * R2 の読み上げ音声を Range 対応で返す。HEAD はヘッダだけを返す。
 * 生成はしない（Gemini を呼ばない）。キーが無い・実体が無いときは 404。
 */
export async function serveSpeechAudio(options: {
  bucket: R2Bucket
  key: string | null
  request: Request
  cacheControl: string
}): Promise<Response> {
  const { bucket, key, request, cacheControl } = options
  if (!key) return new Response(null, { status: 404 })

  const head = await bucket.head(key)
  if (!head) return new Response(null, { status: 404 })

  const size = head.size
  const headers = new Headers({
    'Content-Type': SPEECH_MIME_TYPE,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  })
  const range = parseRange(request.headers.get('Range'), size)

  if (range.type === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }

  const isHead = request.method === 'HEAD'

  if (range.type === 'range') {
    const length = range.end - range.start + 1
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    headers.set('Content-Length', String(length))
    if (isHead) return new Response(null, { status: 206, headers })

    const obj = await bucket.get(key, {
      range: { offset: range.start, length },
    })
    if (!obj) return new Response(null, { status: 404 })
    return new Response(obj.body as unknown as ReadableStream, {
      status: 206,
      headers,
    })
  }

  headers.set('Content-Length', String(size))
  if (isHead) return new Response(null, { status: 200, headers })

  const obj = await bucket.get(key)
  if (!obj) return new Response(null, { status: 404 })
  return new Response(obj.body as unknown as ReadableStream, {
    status: 200,
    headers,
  })
}
