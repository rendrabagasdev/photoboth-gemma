import { activeManifest, storageError } from '../server/vercel-share.js'

function page(id: string): Response {
  const photoUrl = `/api/file?id=${encodeURIComponent(id)}&kind=photo`
  const liveUrl = `/api/file?id=${encodeURIComponent(id)}&kind=live`
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="mobile-web-app-capable" content="yes"><meta name="theme-color" content="#fffaf0"><title>TOBFest</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#fffaf0;color:#171711;font-family:Arial,sans-serif}main{width:min(100%,420px);text-align:center}h1{font-size:42px}img{width:min(100%,280px);aspect-ratio:2/3;object-fit:cover;border:2px solid #171711;box-shadow:10px 10px 0 #171711;margin-bottom:30px}.actions{display:grid;gap:12px}a{display:block;padding:17px;border:2px solid #171711;border-radius:999px;color:#171711;background:#b8f43d;text-decoration:none;font-weight:900}a:last-child{background:#ff654d;color:#fff}small{display:block;margin-top:18px;color:#68685f}</style></head><body><main><h1>TOBFEST</h1><img src="${photoUrl}" alt="Hasil foto"><div class="actions"><a href="${photoUrl}">Foto JPG</a><a href="${liveUrl}">Motion Photo JPG</a></div><small>Aktif selama sesi</small></main></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    try {
      const id = new URL(request.url).searchParams.get('id') ?? ''
      const manifest = id ? await activeManifest(id) : null
      return manifest ? page(id) : new Response('Tautan tidak tersedia', { status: 404 })
    } catch (error) {
      return storageError(error)
    }
  },
}
