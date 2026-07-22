import { activeManifest, readShareFile, storageError } from '../server/vercel-share.js'

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    try {
      const url = new URL(request.url)
      const id = url.searchParams.get('id') ?? ''
      const kind = url.searchParams.get('kind')
      if (kind !== 'photo' && kind !== 'live') return new Response('Tidak tersedia', { status: 404 })
      const manifest = id ? await activeManifest(id) : null
      if (!manifest) return new Response('Tidak tersedia', { status: 404 })
      return await readShareFile(manifest, kind) ?? new Response('Tidak tersedia', { status: 404 })
    } catch (error) {
      return storageError(error)
    }
  },
}
