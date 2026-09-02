// MediaRecorder melaporkan mimeType lengkap dengan parameter codec, misalnya
// `video/mp4;codecs=h264`. Nilai itu hanya relevan untuk MediaRecorder.isTypeSupported
// dan tidak boleh ikut menjadi metadata berkas: Blob, upload multipart, sampai header
// `content-type` pada halaman unduhan harus memakai tipe MP4 polos agar ponsel
// mengenali hasilnya sebagai video biasa dan bukan berkas tak dikenal.
export const LIVE_PHOTO_MIME_TYPE = 'video/mp4'
export const LIVE_PHOTO_EXTENSION = 'mp4'
import { Input, Output, Mp4OutputFormat, BufferTarget, BlobSource, ALL_FORMATS, Conversion } from 'mediabunny'


/**
 * Safari nulis fragmented MP4 dengan duration di mvhd/tkhd/mdhd = 0, makanya metadata-nya
 * kebaca 00:00 pas didownload. Remux blob-nya jadi MP4 dengan header yang benar — codec
 * input dan output sama, jadi cuma copy sample, bukan re-encode.
 */
export async function fixMp4Duration(blob: Blob): Promise<Blob> {
  try {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
    const conversion = await Conversion.init({ input, output })
    if (!conversion.isValid) return blob
    await conversion.execute()
    return new Blob([output.target.buffer!], { type: LIVE_PHOTO_MIME_TYPE })
  } catch {
    return blob
  }
}

export function normalizeLiveMimeType(mimeType: string | undefined): string {
  const base = mimeType?.split(';')[0]?.trim().toLowerCase()
  return base?.startsWith('video/') ? base : LIVE_PHOTO_MIME_TYPE
}

/** Menyamakan tipe Blob tanpa menyalin datanya. */
export function withLiveMimeType(blob: Blob): Blob {
  const mimeType = normalizeLiveMimeType(blob.type)
  return blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType)
}
