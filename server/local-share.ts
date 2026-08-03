import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

type LocalShare = {
  photo: Buffer
  photoType: string
  live: Buffer
  liveType: string
  liveExtension: 'mp4'
  destroyTokenHash: string
  expiresAt: number
}

const shares = new Map<string, LocalShare>()
const SHARE_LIFETIME_MS = 24 * 60 * 60 * 1_000
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const SHARE_ID_PATTERN = /^[0-9a-f-]{36}$/i

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(value))
}

async function requestBody(request: IncomingMessage): Promise<Buffer> {
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    throw new Error('upload_too_large')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_UPLOAD_BYTES) throw new Error('upload_too_large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function activeShare(id: string): LocalShare | undefined {
  const share = shares.get(id)
  if (!share) return undefined
  if (share.expiresAt > Date.now()) return share
  shares.delete(id)
  return undefined
}

function downloadPage(id: string): string {
  const safeId = encodeURIComponent(id)
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fffaf0"><title>TOBFest</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#fffaf0;color:#171711;font-family:Arial,sans-serif}main{width:min(100%,420px);text-align:center}h1{font-size:42px}img{width:min(100%,280px);aspect-ratio:2/3;object-fit:cover;border:2px solid #171711;box-shadow:10px 10px 0 #171711;margin-bottom:30px}.actions{display:grid;gap:12px}a{display:block;padding:17px;border:2px solid #171711;border-radius:999px;color:#171711;background:#b8f43d;text-decoration:none;font-weight:900}a:last-child{background:#ff654d;color:#fff}small{display:block;margin-top:18px;color:#68685f}</style></head><body><main><h1>TOBFEST</h1><img src="/api/shares/${safeId}/photo" alt="Hasil foto"><div class="actions"><a href="/api/shares/${safeId}/photo">Foto</a><a href="/api/shares/${safeId}/live">Live</a></div><small>Aktif selama sesi server</small></main></body></html>`
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers()
  Object.entries(request.headers).forEach(([name, value]) => {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
    else if (value !== undefined) headers.set(name, value)
  })
  return headers
}

async function createShare(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  origin: string,
): Promise<void> {
  try {
    const body = await requestBody(request)
    const webRequest = new Request(requestUrl, {
      method: 'POST',
      headers: requestHeaders(request),
      body: new Uint8Array(body),
    })
    const form = await webRequest.formData()
    const photo = form.get('photo')
    const live = form.get('live')
    const sessionId = String(form.get('sessionId') ?? '')
    if (!(photo instanceof Blob) || !(live instanceof Blob) || !sessionId) {
      sendJson(response, { error: 'invalid_upload' }, 400)
      return
    }
    if (photo.type !== 'image/jpeg' || !live.type.includes('mp4')) {
      sendJson(response, { error: 'invalid_upload_type' }, 400)
      return
    }

    const id = randomUUID()
    const destroyToken = randomBytes(24).toString('base64url')
    const expiresAt = Date.now() + SHARE_LIFETIME_MS
    shares.set(id, {
      photo: Buffer.from(await photo.arrayBuffer()),
      photoType: photo.type,
      live: Buffer.from(await live.arrayBuffer()),
      liveType: live.type || 'video/mp4',
      liveExtension: 'mp4',
      destroyTokenHash: hashToken(destroyToken),
      expiresAt,
    })
    sendJson(response, {
      id,
      downloadUrl: `${origin}/download/${id}`,
      expiresAt: new Date(expiresAt).toISOString(),
      destroyToken,
    }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'upload_too_large') {
      sendJson(response, { error: 'upload_too_large' }, 413)
      return
    }
    console.error('[share]', error)
    sendJson(response, { error: 'local_share_failed' }, 500)
  }
}

export async function handleShareRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  origin: string,
): Promise<boolean> {
  if (request.method === 'POST' && url.pathname === '/api/shares') {
    await createShare(request, response, url, origin)
    return true
  }

  const destroyMatch = url.pathname.match(/^\/api\/shares\/([^/]+)$/)
  if (request.method === 'DELETE' && destroyMatch) {
    const id = destroyMatch[1]
    if (!SHARE_ID_PATTERN.test(id)) {
      response.statusCode = 404
      response.end()
      return true
    }
    const share = activeShare(id)
    if (!share) {
      response.statusCode = 404
      response.end()
      return true
    }
    if (hashToken(String(request.headers['x-share-token'] ?? '')) !== share.destroyTokenHash) {
      sendJson(response, { error: 'forbidden' }, 403)
      return true
    }
    shares.delete(id)
    response.statusCode = 204
    response.end()
    return true
  }

  const fileMatch = url.pathname.match(/^\/api\/shares\/([^/]+)\/(photo|live)$/)
  if ((request.method === 'GET' || request.method === 'HEAD') && fileMatch) {
    const id = fileMatch[1]
    const share = SHARE_ID_PATTERN.test(id) ? activeShare(id) : undefined
    if (!share) {
      response.statusCode = 404
      response.end('Tidak tersedia')
      return true
    }
    const isPhoto = fileMatch[2] === 'photo'
    const content = isPhoto ? share.photo : share.live
    response.setHeader('content-type', isPhoto ? share.photoType : share.liveType)
    response.setHeader('content-length', content.byteLength)
    response.setHeader('cache-control', 'private, no-store')
    response.setHeader(
      'content-disposition',
      `attachment; filename="tobfest-${fileMatch[2]}-${id.slice(0, 8)}.${isPhoto ? 'jpg' : share.liveExtension}"`,
    )
    response.end(request.method === 'HEAD' ? undefined : content)
    return true
  }

  const pageMatch = url.pathname.match(/^\/download\/([^/]+)$/)
  if ((request.method === 'GET' || request.method === 'HEAD') && pageMatch) {
    const id = pageMatch[1]
    if (!SHARE_ID_PATTERN.test(id) || !activeShare(id)) {
      response.statusCode = 404
      response.end('Tautan tidak tersedia')
      return true
    }
    const page = downloadPage(id)
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(request.method === 'HEAD' ? undefined : page)
    return true
  }

  return false
}
