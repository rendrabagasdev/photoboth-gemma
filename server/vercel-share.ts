import { del, get, put } from '@vercel/blob'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

export type ShareManifest = {
  id: string
  sessionId: string
  photoType: string
  liveType: string
  liveExtension: string
  destroyTokenHash: string
  expiresAt: string
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export const SHARE_LIFETIME_MS = 24 * 60 * 60 * 1_000

function ensureStorage(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN belum dikonfigurasi.')
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createShareIdentity(): { id: string; destroyToken: string } {
  return { id: randomUUID(), destroyToken: randomBytes(24).toString('base64url') }
}

export async function saveShare(
  manifest: ShareManifest,
  photo: File,
  live: File,
): Promise<void> {
  ensureStorage()
  const prefix = `shares/${manifest.id}`
  await Promise.all([
    put(`${prefix}/photo.jpg`, photo, {
      access: 'private',
      contentType: manifest.photoType,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    }),
    put(`${prefix}/live.${manifest.liveExtension}`, live, {
      access: 'private',
      contentType: manifest.liveType,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    }),
    put(`${prefix}/manifest.json`, JSON.stringify(manifest), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    }),
  ])
}

export async function readManifest(id: string): Promise<ShareManifest | null> {
  ensureStorage()
  const result = await get(`shares/${id}/manifest.json`, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return null
  return new Response(result.stream).json() as Promise<ShareManifest>
}

export async function deleteShare(manifest: ShareManifest): Promise<void> {
  ensureStorage()
  const prefix = `shares/${manifest.id}`
  await del([
    `${prefix}/photo.jpg`,
    `${prefix}/live.${manifest.liveExtension}`,
    `${prefix}/manifest.json`,
  ])
}

export async function activeManifest(id: string): Promise<ShareManifest | null> {
  const manifest = await readManifest(id)
  if (!manifest) return null
  if (Date.parse(manifest.expiresAt) > Date.now()) return manifest
  await deleteShare(manifest)
  return null
}

export async function readShareFile(
  manifest: ShareManifest,
  kind: 'photo' | 'live',
): Promise<Response | null> {
  ensureStorage()
  const isPhoto = kind === 'photo'
  const path = isPhoto
    ? `shares/${manifest.id}/photo.jpg`
    : `shares/${manifest.id}/live.${manifest.liveExtension}`
  const result = await get(path, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return null
  const extension = isPhoto ? 'jpg' : manifest.liveExtension
  return new Response(result.stream, {
    headers: {
      'content-type': isPhoto ? manifest.photoType : manifest.liveType,
      'content-disposition': `attachment; filename="tobfest-${kind}-${manifest.id.slice(0, 8)}.${extension}"`,
      'cache-control': 'private, no-store',
    },
  })
}

export function storageError(error: unknown): Response {
  const notConfigured = error instanceof Error && error.message.includes('BLOB_READ_WRITE_TOKEN')
  return Response.json(
    { error: notConfigured ? 'storage_not_configured' : 'storage_failed' },
    { status: notConfigured ? 503 : 500 },
  )
}
