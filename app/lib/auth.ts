/**
 * Cloudflare Access JWT 検証
 *
 * CF-Access-Jwt-Assertion ヘッダーから JWT を取り出し、
 * Cloudflare の JWKS エンドポイントで署名を検証する。
 */

interface JWK {
  kty: string
  n: string
  e: string
  kid: string
}

interface JWKS {
  keys: JWK[]
}

interface JWTHeader {
  alg: string
  kid: string
}

interface JWTPayload {
  aud: string[]
  iss: string
  exp: number
  iat: number
  sub: string
  email?: string
}

let cachedJWKS: { keys: JWK[]; fetchedAt: number } | null = null
const JWKS_CACHE_TTL = 60 * 60 * 1000 // 1時間

// clock skew（サーバー間の時刻ズレ）を吸収するための許容秒数
const CLOCK_SKEW_TOLERANCE_SECONDS = 60

// テスト専用: モジュールレベルのキャッシュをテスト間でリセットするため
export function __resetJWKSCacheForTest(): void {
  cachedJWKS = null
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function fetchJWKS(
  teamDomain: string,
  forceRefresh = false,
): Promise<JWK[]> {
  const now = Date.now()
  if (
    !forceRefresh &&
    cachedJWKS &&
    now - cachedJWKS.fetchedAt < JWKS_CACHE_TTL
  ) {
    return cachedJWKS.keys
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status}`)
  }

  const jwks: JWKS = await res.json()
  cachedJWKS = { keys: jwks.keys, fetchedAt: now }
  return jwks.keys
}

async function importPublicKey(jwk: JWK): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
}

function decodeJWT(token: string): {
  header: JWTHeader
  payload: JWTPayload
  signedPart: string
  signature: Uint8Array
} {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const header: JWTHeader = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[0])),
  )
  const payload: JWTPayload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[1])),
  )
  const signature = base64UrlDecode(parts[2])

  return {
    header,
    payload,
    signedPart: `${parts[0]}.${parts[1]}`,
    signature,
  }
}

/**
 * CF Access の JWT を検証する
 * 成功時は true、失敗時は false を返す
 */
export async function verifyAccess(
  token: string | undefined,
  teamDomain: string,
  aud: string,
): Promise<boolean> {
  if (!token) return false

  try {
    const { header, payload, signedPart, signature } = decodeJWT(token)

    if (header.alg !== 'RS256') return false

    // aud の検証
    if (!payload.aud.includes(aud)) return false

    // iss の検証（JWKS は team domain 固定なので実害は薄いが defense-in-depth として）
    if (payload.iss !== `https://${teamDomain}`) return false

    // 有効期限の検証（エッジ間の時刻ズレを吸収するため clock skew を許容する）
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now - CLOCK_SKEW_TOLERANCE_SECONDS) return false

    // 署名の検証
    let keys = await fetchJWKS(teamDomain)
    let jwk = keys.find((k) => k.kid === header.kid)
    if (!jwk) {
      // 鍵ローテーション対応: キャッシュに無ければキャッシュを破棄して1回だけ再フェッチする
      keys = await fetchJWKS(teamDomain, true)
      jwk = keys.find((k) => k.kid === header.kid)
      if (!jwk) return false
    }

    const publicKey = await importPublicKey(jwk)
    const data = new TextEncoder().encode(signedPart)
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature.buffer as ArrayBuffer,
      data.buffer as ArrayBuffer,
    )

    return valid
  } catch {
    return false
  }
}
