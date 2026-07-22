export type ShareUpload = {
  photo: Blob
  live: Blob
}

export type SharedResult = {
  id: string
  downloadUrl: string
  expiresAt: string
}

export interface ShareService {
  publish(sessionId: string, upload: ShareUpload): Promise<SharedResult>
}
