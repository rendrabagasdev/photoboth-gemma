import {
  deleteShare,
  hashToken,
  readManifest,
  storageError,
} from '../server/vercel-share.js'

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'DELETE') return new Response('Method not allowed', { status: 405 })
    try {
      const id = new URL(request.url).searchParams.get('id') ?? ''
      const manifest = id ? await readManifest(id) : null
      if (!manifest) return new Response(null, { status: 404 })
      const destroyToken = request.headers.get('x-share-token') ?? ''
      if (!destroyToken || hashToken(destroyToken) !== manifest.destroyTokenHash) {
        return Response.json({ error: 'forbidden' }, { status: 403 })
      }
      await deleteShare(manifest)
      return new Response(null, { status: 204 })
    } catch (error) {
      return storageError(error)
    }
  },
}
