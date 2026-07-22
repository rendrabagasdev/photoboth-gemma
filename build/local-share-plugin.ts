import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type LocalShare = {
  photo: Buffer
  photoType: string
  live: Buffer
  liveType: string
  liveExtension: string
  destroyTokenHash: string
  expiresAt: number
}

const shares = new Map<string, LocalShare>()
const SHARE_LIFETIME_MS = 24 * 60 * 60 * 1_000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function requestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(value))
}

function activeShare(id: string): LocalShare | undefined {
  const share = shares.get(id)
  if (!share) return undefined
  if (share.expiresAt > Date.now()) return share
  shares.delete(id)
  return undefined
}

function downloadPage(id: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TOBFest</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#fffaf0;color:#171711;font-family:Arial,sans-serif}main{width:min(100%,420px);text-align:center}h1{font-size:42px}img{width:min(100%,280px);aspect-ratio:2/3;object-fit:cover;border:2px solid #171711;box-shadow:10px 10px 0 #171711;margin-bottom:30px}.actions{display:grid;gap:12px}a{display:block;padding:17px;border:2px solid #171711;border-radius:999px;color:#171711;background:#b8f43d;text-decoration:none;font-weight:900}a:last-child{background:#ff654d;color:#fff}small{display:block;margin-top:18px;color:#68685f}</style></head><body><main><h1>TOBFEST</h1><img src="/api/shares/${id}/photo" alt="Hasil foto"><div class="actions"><a href="/api/shares/${id}/photo">Foto</a><a href="/api/shares/${id}/live">Live</a></div><small>Aktif selama sesi</small></main></body></html>`
}

async function handleLocalShare(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const origin = `http://${request.headers.host ?? 'localhost'}`
  const url = new URL(request.url ?? '/', origin)

  if (request.method === 'POST' && url.pathname === '/api/shares') {
    const body = await requestBody(request)
    const webHeaders = new Headers()
    Object.entries(request.headers).forEach(([name, value]) => {
      if (Array.isArray(value)) value.forEach((item) => webHeaders.append(name, item))
      else if (value !== undefined) webHeaders.set(name, value)
    })
    const webRequest = new Request(url, {
      method: 'POST',
      headers: webHeaders,
      body: new Uint8Array(body),
    })
    const form = await webRequest.formData()
    const photo = form.get('photo')
    const live = form.get('live')
    if (!(photo instanceof File) || !(live instanceof File)) {
      sendJson(response, { error: 'invalid_upload' }, 400)
      return true
    }

    const id = randomUUID()
    const destroyToken = randomBytes(24).toString('base64url')
    const liveExtension = live.type.includes('mp4') ? 'mp4' : 'webm'
    shares.set(id, {
      photo: Buffer.from(await photo.arrayBuffer()),
      photoType: photo.type || 'image/jpeg',
      live: Buffer.from(await live.arrayBuffer()),
      liveType: live.type || 'video/webm',
      liveExtension,
      destroyTokenHash: hashToken(destroyToken),
      expiresAt: Date.now() + SHARE_LIFETIME_MS,
    })
    sendJson(response, {
      id,
      downloadUrl: new URL(`/download/${id}`, origin).toString(),
      expiresAt: new Date(Date.now() + SHARE_LIFETIME_MS).toISOString(),
      destroyToken,
    }, 201)
    return true
  }

  const destroyMatch = url.pathname.match(/^\/api\/shares\/([0-9a-f-]+)$/)
  if (request.method === 'DELETE' && destroyMatch) {
    const share = activeShare(destroyMatch[1])
    if (!share) {
      response.statusCode = 404
      response.end()
      return true
    }
    if (hashToken(String(request.headers['x-share-token'] ?? '')) !== share.destroyTokenHash) {
      sendJson(response, { error: 'forbidden' }, 403)
      return true
    }
    shares.delete(destroyMatch[1])
    response.statusCode = 204
    response.end()
    return true
  }

  const fileMatch = url.pathname.match(/^\/api\/shares\/([0-9a-f-]+)\/(photo|live)$/)
  if (request.method === 'GET' && fileMatch) {
    const share = activeShare(fileMatch[1])
    if (!share) {
      response.statusCode = 404
      response.end('Tidak tersedia')
      return true
    }
    const isPhoto = fileMatch[2] === 'photo'
    response.setHeader('content-type', isPhoto ? share.photoType : share.liveType)
    response.setHeader('content-disposition', `attachment; filename="tobfest-${fileMatch[2]}-${fileMatch[1].slice(0, 8)}.${isPhoto ? 'jpg' : share.liveExtension}"`)
    response.end(isPhoto ? share.photo : share.live)
    return true
  }

  const pageMatch = url.pathname.match(/^\/download\/([0-9a-f-]+)$/)
  if (request.method === 'GET' && pageMatch) {
    if (!activeShare(pageMatch[1])) {
      response.statusCode = 404
      response.end('Tautan tidak tersedia')
      return true
    }
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(downloadPage(pageMatch[1]))
    return true
  }

  return false
}

export function localSharePlugin(): Plugin {
  return {
    name: 'tobfest-local-share',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void handleLocalShare(request, response)
          .then((handled) => { if (!handled) next() })
          .catch((error: unknown) => {
            server.config.logger.error(error instanceof Error ? error.message : 'Local share gagal.')
            if (!response.headersSent) sendJson(response, { error: 'local_share_failed' }, 500)
            else response.end()
          })
      })
    },
  }
}
