interface StoredObject {
  body: ReadableStream
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
}

interface ObjectBucket {
  put(
    key: string,
    value: ArrayBuffer | string,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(keys: string[]): Promise<void>
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  DOWNLOADS: ObjectBucket
}

type ShareManifest = {
  id: string
  sessionId: string
  photoType: string
  liveType: string
  liveExtension: string
  destroyTokenHash: string
  expiresAt: string
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const SHARE_LIFETIME_MS = 24 * 60 * 60 * 1_000

function cors(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Share-Token')
  return new Response(response.body, { status: response.status, headers })
}

function json(value: unknown, status = 200): Response {
  return cors(new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  }))
}

async function readManifest(env: Env, id: string): Promise<ShareManifest | null> {
  const object = await env.DOWNLOADS.get(`shares/${id}/manifest.json`)
  if (!object) return null
  return new Response(object.body).json() as Promise<ShareManifest>
}

async function createShare(request: Request, env: Env): Promise<Response> {
  const form = await request.formData()
  const photo = form.get('photo')
  const live = form.get('live')
  const sessionId = String(form.get('sessionId') ?? '')
  if (!(photo instanceof File) || !(live instanceof File) || !sessionId) {
    return json({ error: 'invalid_upload' }, 400)
  }
  if (photo.size + live.size > MAX_UPLOAD_BYTES) return json({ error: 'upload_too_large' }, 413)

  const id = crypto.randomUUID()
  const destroyTokenBytes = crypto.getRandomValues(new Uint8Array(24))
  const destroyToken = btoa(String.fromCharCode(...destroyTokenBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  if (!live.type.includes('mp4')) return json({ error: 'invalid_live_video' }, 400)
  const liveExtension = 'mp4'
  const manifest: ShareManifest = {
    id,
    sessionId,
    photoType: photo.type || 'image/jpeg',
    liveType: live.type || 'video/mp4',
    liveExtension,
    destroyTokenHash: await hashToken(destroyToken),
    expiresAt: new Date(Date.now() + SHARE_LIFETIME_MS).toISOString(),
  }
  const prefix = `shares/${id}`

  await Promise.all([
    env.DOWNLOADS.put(`${prefix}/photo.jpg`, await photo.arrayBuffer(), {
      httpMetadata: { contentType: manifest.photoType },
    }),
    env.DOWNLOADS.put(`${prefix}/live.${liveExtension}`, await live.arrayBuffer(), {
      httpMetadata: { contentType: manifest.liveType },
    }),
    env.DOWNLOADS.put(`${prefix}/manifest.json`, JSON.stringify(manifest), {
      httpMetadata: { contentType: 'application/json' },
    }),
  ])

  return json({
    id,
    downloadUrl: new URL(`/download/${id}`, request.url).toString(),
    expiresAt: manifest.expiresAt,
    destroyToken,
  }, 201)
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function destroyShare(request: Request, env: Env, id: string): Promise<Response> {
  const manifest = await readManifest(env, id)
  if (!manifest) return cors(new Response(null, { status: 404 }))
  const destroyToken = request.headers.get('x-share-token') ?? ''
  if (!destroyToken || await hashToken(destroyToken) !== manifest.destroyTokenHash) {
    return json({ error: 'forbidden' }, 403)
  }
  const prefix = `shares/${id}`
  await env.DOWNLOADS.delete([
    `${prefix}/photo.jpg`,
    `${prefix}/live.${manifest.liveExtension}`,
    `${prefix}/manifest.json`,
  ])
  return cors(new Response(null, { status: 204 }))
}

async function getShare(env: Env, id: string): Promise<ShareManifest | null> {
  const manifest = await readManifest(env, id)
  if (!manifest) return null
  if (Date.parse(manifest.expiresAt) > Date.now()) return manifest
  const prefix = `shares/${id}`
  await env.DOWNLOADS.delete([
    `${prefix}/photo.jpg`,
    `${prefix}/live.${manifest.liveExtension}`,
    `${prefix}/manifest.json`,
  ])
  return null
}

async function downloadFile(env: Env, id: string, kind: 'photo' | 'live'): Promise<Response> {
  const manifest = await getShare(env, id)
  if (!manifest) return new Response('Tidak tersedia', { status: 404 })
  const isPhoto = kind === 'photo'
  const key = isPhoto ? `shares/${id}/photo.jpg` : `shares/${id}/live.${manifest.liveExtension}`
  const object = await env.DOWNLOADS.get(key)
  if (!object) return new Response('Tidak tersedia', { status: 404 })
  const extension = isPhoto ? 'jpg' : manifest.liveExtension
  return new Response(object.body, {
    headers: {
      'content-type': isPhoto ? manifest.photoType : manifest.liveType,
      'content-disposition': `attachment; filename="tobfest-${kind}-${id.slice(0, 8)}.${extension}"`,
      'cache-control': 'private, max-age=300',
    },
  })
}

function downloadPage(id: string): Response {
  return new Response(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#fffaf0"><title>TOBFest</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#fffaf0;color:#171711;font-family:Arial,sans-serif}main{width:min(100%,420px);text-align:center}h1{font-size:42px;margin:0 0 22px}img{width:min(100%,280px);aspect-ratio:2/3;object-fit:cover;border:2px solid #171711;box-shadow:10px 10px 0 #171711;margin-bottom:30px}.actions{display:grid;gap:12px}a{display:block;padding:17px 20px;border:2px solid #171711;border-radius:999px;color:#171711;background:#b8f43d;text-decoration:none;font-weight:900}a:last-child{background:#ff654d;color:#fff}small{display:block;margin-top:18px;color:#68685f}</style></head>
<body><main><h1>TOBFEST</h1><img src="/api/shares/${id}/photo" alt="Hasil foto"><div class="actions"><a href="/api/shares/${id}/photo">Foto</a><a href="/api/shares/${id}/live">Live</a></div><small>Aktif selama sesi</small></main></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))
    if (request.method === 'POST' && url.pathname === '/api/shares') return createShare(request, env)

    const destroyMatch = url.pathname.match(/^\/api\/shares\/([0-9a-f-]+)$/)
    if (request.method === 'DELETE' && destroyMatch) return destroyShare(request, env, destroyMatch[1])

    const downloadMatch = url.pathname.match(/^\/api\/shares\/([0-9a-f-]+)\/(photo|live)$/)
    if (request.method === 'GET' && downloadMatch) {
      return downloadFile(env, downloadMatch[1], downloadMatch[2] as 'photo' | 'live')
    }

    const pageMatch = url.pathname.match(/^\/download\/([0-9a-f-]+)$/)
    if (request.method === 'GET' && pageMatch) {
      const manifest = await getShare(env, pageMatch[1])
      return manifest ? downloadPage(pageMatch[1]) : new Response('Tautan tidak tersedia', { status: 404 })
    }

    return env.ASSETS.fetch(request)
  },
}
