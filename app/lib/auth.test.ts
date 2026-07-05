import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'
import { __resetJWKSCacheForTest, verifyAccess } from './auth'

const TEAM_DOMAIN = 'example.cloudflareaccess.com'
const AUD = 'test-aud-tag'

// RSA鍵ペアの生成は重い(数秒)ため、テストファイル全体で使い回す。
// 各テストは kid や payload を変えるだけで、鍵ペア自体の使い分けは
// 「JWKS上の公開鍵」と「署名に使う秘密鍵」の組み合わせで表現する。
let primaryKeyPair: CryptoKeyPair
let otherKeyPair: CryptoKeyPair
let oldKeyPair: CryptoKeyPair
let newKeyPair: CryptoKeyPair

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str))
}

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
}

async function exportJwk(
  publicKey: CryptoKey,
  kid: string,
): Promise<{ kty: string; n: string; e: string; kid: string }> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey)
  return {
    kty: jwk.kty as string,
    n: jwk.n as string,
    e: jwk.e as string,
    kid,
  }
}

type SignJwtOptions = {
  privateKey: CryptoKey
  kid: string
  alg?: string
  aud?: string[]
  iss?: string
  exp?: number
  iat?: number
  sub?: string
}

async function signJWT({
  privateKey,
  kid,
  alg = 'RS256',
  aud = [AUD],
  iss = `https://${TEAM_DOMAIN}`,
  exp = Math.floor(Date.now() / 1000) + 3600,
  iat = Math.floor(Date.now() / 1000),
  sub = 'user-1',
}: SignJwtOptions): Promise<string> {
  const header = { alg, kid }
  const payload = { aud, iss, exp, iat, sub }

  const headerB64 = base64UrlEncodeString(JSON.stringify(header))
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload))
  const signedPart = `${headerB64}.${payloadB64}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signedPart),
  )

  return `${signedPart}.${base64UrlEncode(new Uint8Array(signature))}`
}

function jwksResponse(
  keys: Array<{ kty: string; n: string; e: string; kid: string }>,
): Response {
  return new Response(JSON.stringify({ keys }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeAll(async () => {
  ;[primaryKeyPair, otherKeyPair, oldKeyPair, newKeyPair] = await Promise.all([
    generateKeyPair(),
    generateKeyPair(),
    generateKeyPair(),
    generateKeyPair(),
  ])
}, 30_000)

beforeEach(() => {
  __resetJWKSCacheForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('verifyAccess', () => {
  test('tokenがundefinedならfalse', async () => {
    await expect(verifyAccess(undefined, TEAM_DOMAIN, AUD)).resolves.toBe(false)
  })

  test('正しい署名・aud・iss・expならtrue', async () => {
    const jwk = await exportJwk(primaryKeyPair.publicKey, 'kid-1')
    const fetchMock = vi.fn().mockResolvedValue(jwksResponse([jwk]))
    vi.stubGlobal('fetch', fetchMock)

    const token = await signJWT({
      privateKey: primaryKeyPair.privateKey,
      kid: 'kid-1',
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('algがRS256以外ならfalse', async () => {
    const jwk = await exportJwk(primaryKeyPair.publicKey, 'kid-1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jwksResponse([jwk])))

    const token = await signJWT({
      privateKey: primaryKeyPair.privateKey,
      kid: 'kid-1',
      alg: 'none',
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(false)
  })

  test('audが一致しなければfalse', async () => {
    const jwk = await exportJwk(primaryKeyPair.publicKey, 'kid-1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jwksResponse([jwk])))

    const token = await signJWT({
      privateKey: primaryKeyPair.privateKey,
      kid: 'kid-1',
      aud: ['other-aud'],
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(false)
  })

  test('issがteamDomainと一致しなければfalse', async () => {
    const jwk = await exportJwk(primaryKeyPair.publicKey, 'kid-1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jwksResponse([jwk])))

    const token = await signJWT({
      privateKey: primaryKeyPair.privateKey,
      kid: 'kid-1',
      iss: 'https://evil.example.com',
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(false)
  })

  test('expが60秒以内の失効ならclock skew許容でtrue', async () => {
    const jwk = await exportJwk(primaryKeyPair.publicKey, 'kid-1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jwksResponse([jwk])))

    const now = Math.floor(Date.now() / 1000)
    const token = await signJWT({
      privateKey: primaryKeyPair.privateKey,
      kid: 'kid-1',
      exp: now - 30,
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(true)
  })

  test('expが60秒より前に失効していればfalse', async () => {
    const jwk = await exportJwk(primaryKeyPair.publicKey, 'kid-1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jwksResponse([jwk])))

    const now = Math.floor(Date.now() / 1000)
    const token = await signJWT({
      privateKey: primaryKeyPair.privateKey,
      kid: 'kid-1',
      exp: now - 61,
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(false)
  })

  test('署名が不正ならfalse', async () => {
    const jwk = await exportJwk(primaryKeyPair.publicKey, 'kid-1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jwksResponse([jwk])))

    // JWKS上の公開鍵とは別の秘密鍵で署名する(=署名検証は失敗するはず)
    const token = await signJWT({
      privateKey: otherKeyPair.privateKey,
      kid: 'kid-1',
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(false)
  })

  test('JWT形式が不正ならfalse', async () => {
    vi.stubGlobal('fetch', vi.fn())

    await expect(verifyAccess('not-a-jwt', TEAM_DOMAIN, AUD)).resolves.toBe(
      false,
    )
  })

  test('kidがキャッシュに無ければ1回だけ再フェッチして再検索する(鍵ローテーション)', async () => {
    const oldJwk = await exportJwk(oldKeyPair.publicKey, 'kid-old')
    const newJwk = await exportJwk(newKeyPair.publicKey, 'kid-new')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jwksResponse([oldJwk]))
      .mockResolvedValueOnce(jwksResponse([oldJwk, newJwk]))
    vi.stubGlobal('fetch', fetchMock)

    const token = await signJWT({
      privateKey: newKeyPair.privateKey,
      kid: 'kid-new',
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('再フェッチしてもkidが見つからなければfalse', async () => {
    const oldJwk = await exportJwk(oldKeyPair.publicKey, 'kid-old')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jwksResponse([oldJwk]))
      .mockResolvedValueOnce(jwksResponse([oldJwk]))
    vi.stubGlobal('fetch', fetchMock)

    // kid-unknown はどちらのフェッチ結果にも存在しないので、
    // 署名検証まで到達せずに false になるはず(署名鍵は何でもよい)
    const token = await signJWT({
      privateKey: newKeyPair.privateKey,
      kid: 'kid-unknown',
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('JWKS取得に失敗すればfalse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error', { status: 500 })),
    )

    const token = await signJWT({
      privateKey: primaryKeyPair.privateKey,
      kid: 'kid-1',
    })

    await expect(verifyAccess(token, TEAM_DOMAIN, AUD)).resolves.toBe(false)
  })
})
