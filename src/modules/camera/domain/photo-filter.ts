export type PhotoFilter = 'normal' | 'warm' | 'mono'

export function getFilterCssString(filter: PhotoFilter): string {
  if (filter === 'warm') return 'sepia(0.2) saturate(1.22) contrast(1.04)'
  if (filter === 'mono') return 'grayscale(1) contrast(1.08)'
  return 'none'
}

/**
 * Memanipulasi pixel ImageData secara langsung sebagai fallback
 * yang 100% kompatibel di semua browser/WebKit Safari.
 */
export function applyFilterToImageData(imageData: ImageData, filter: PhotoFilter): void {
  if (filter === 'normal') return

  const data = imageData.data
  const len = data.length

  if (filter === 'mono') {
    for (let i = 0; i < len; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      // Grayscale luminance (ITU-R BT.601)
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      // Contrast 1.08
      const adjusted = (luma - 128) * 1.08 + 128
      const v = adjusted < 0 ? 0 : adjusted > 255 ? 255 : adjusted
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    }
    return
  }

  if (filter === 'warm') {
    for (let i = 0; i < len; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // 1. Sepia (20% intensity)
      const r1 = 0.8786 * r + 0.1538 * g + 0.0378 * b
      const g1 = 0.0698 * r + 0.9372 * g + 0.0336 * b
      const b1 = 0.0544 * r + 0.1068 * g + 0.8268 * b

      // 2. Saturation (1.22 factor)
      const luma = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1
      const r2 = luma + (r1 - luma) * 1.22
      const g2 = luma + (g1 - luma) * 1.22
      const b2 = luma + (b1 - luma) * 1.22

      // 3. Contrast (1.04 factor)
      const r3 = (r2 - 128) * 1.04 + 128
      const g3 = (g2 - 128) * 1.04 + 128
      const b3 = (b2 - 128) * 1.04 + 128

      data[i] = r3 < 0 ? 0 : r3 > 255 ? 255 : r3
      data[i + 1] = g3 < 0 ? 0 : g3 > 255 ? 255 : g3
      data[i + 2] = b3 < 0 ? 0 : b3 > 255 ? 255 : b3
    }
  }
}

/**
 * Menguji apakah browser mendukung CanvasRenderingContext2D.filter dengan benar.
 */
let supportsFilterCache: boolean | undefined

export function supportsCanvasFilter(): boolean {
  if (supportsFilterCache !== undefined) return supportsFilterCache
  if (typeof document === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const ctx = canvas.getContext('2d')
    if (!ctx || typeof ctx.filter !== 'string') {
      supportsFilterCache = false
      return false
    }

    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 2, 2)
    ctx.filter = 'grayscale(1)'
    ctx.drawImage(canvas, 0, 0)
    const imgData = ctx.getImageData(0, 0, 1, 1).data
    // Jika grayscale aktif pada merah (#ff0000), nilai R dan G akan berdekatan
    supportsFilterCache = Math.abs(imgData[0] - imgData[1]) < 20
  } catch {
    supportsFilterCache = false
  }

  return supportsFilterCache
}
