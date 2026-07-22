import {
  MAX_UPLOAD_BYTES,
  SHARE_LIFETIME_MS,
  createShareIdentity,
  hashToken,
  saveShare,
  storageError,
  type ShareManifest,
} from '../server/vercel-share.js'

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    try {
      const form = await request.formData()
      const photo = form.get('photo')
      const live = form.get('live')
      const sessionId = String(form.get('sessionId') ?? '')
      if (!(photo instanceof File) || !(live instanceof File) || !sessionId) {
        return Response.json({ error: 'invalid_upload' }, { status: 400 })
      }
      if (photo.size + live.size > MAX_UPLOAD_BYTES) {
        return Response.json({ error: 'upload_too_large' }, { status: 413 })
      }

      const { id, destroyToken } = createShareIdentity()
      const liveExtension = live.type.includes('mp4') ? 'mp4' : 'webm'
      const manifest: ShareManifest = {
        id,
        sessionId,
        photoType: photo.type || 'image/jpeg',
        liveType: live.type || 'video/webm',
        liveExtension,
        destroyTokenHash: hashToken(destroyToken),
        expiresAt: new Date(Date.now() + SHARE_LIFETIME_MS).toISOString(),
      }
      await saveShare(manifest, photo, live)

      return Response.json({
        id,
        downloadUrl: new URL(`/download/${id}`, request.url).toString(),
        expiresAt: manifest.expiresAt,
        destroyToken,
      }, { status: 201, headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      return storageError(error)
    }
  },
}
