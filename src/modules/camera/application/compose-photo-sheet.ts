import { PRINT_HEIGHT, PRINT_WIDTH, TEMPLATE_HEIGHT, TEMPLATE_WIDTH } from '../domain/template-layout'

export type SheetMarginsMm = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export type SheetMarginsPx = {
  top: number
  right: number
  bottom: number
  left: number
}

export const DEFAULT_SAFE_MARGIN_MM = 2

function parseEnvMargin(key: string, fallback: number): number {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const raw = import.meta.env[key]
    if (typeof raw === 'string' && raw.trim().length > 0) {
      const parsed = parseFloat(raw)
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed
    }
  }
  return fallback
}

export function getDefaultSafeMarginsMm(): Required<SheetMarginsMm> {
  const globalFallback = parseEnvMargin('VITE_PRINT_SAFE_MARGIN_MM', DEFAULT_SAFE_MARGIN_MM)
  return {
    top: parseEnvMargin('VITE_PRINT_MARGIN_TOP_MM', globalFallback),
    right: parseEnvMargin('VITE_PRINT_MARGIN_RIGHT_MM', globalFallback),
    bottom: parseEnvMargin('VITE_PRINT_MARGIN_BOTTOM_MM', globalFallback),
    left: parseEnvMargin('VITE_PRINT_MARGIN_LEFT_MM', globalFallback),
  }
}

export function resolveSafeMarginsPx(margins?: SheetMarginsMm): SheetMarginsPx {
  const defaultMm = getDefaultSafeMarginsMm()
  const topMm = Math.max(0, margins?.top ?? defaultMm.top)
  const rightMm = Math.max(0, margins?.right ?? defaultMm.right)
  const bottomMm = Math.max(0, margins?.bottom ?? defaultMm.bottom)
  const leftMm = Math.max(0, margins?.left ?? defaultMm.left)

  return {
    top: Math.round((topMm / 25.4) * 300),
    right: Math.round((rightMm / 25.4) * 300),
    bottom: Math.round((bottomMm / 25.4) * 300),
    left: Math.round((leftMm / 25.4) * 300),
  }
}

function loadBlobImage(blob: Blob): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => resolve({ image, url })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Strip foto gagal dimuat.'))
    }
    image.src = url
  })
}

function sheetBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Lembar 4R gagal dibuat.')),
      'image/jpeg',
      0.94,
    )
  })
}

/**
 * `print` menyiapkan lembar untuk printer: strip diberi margin aman per sisi dan garis
 * potong. `download` mengisi kanvas penuh tanpa margin maupun garis potong,
 * karena hasil unduhan tidak pernah dipotong secara fisik.
 */
export type PhotoSheetVariant = 'print' | 'download'

export type ComposePhotoSheetOptions = {
  variant?: PhotoSheetVariant
  margins?: SheetMarginsMm
}

export async function composePhotoSheet(
  strip: Blob,
  options: ComposePhotoSheetOptions = {},
): Promise<Blob> {
  const variant = options.variant ?? 'print'
  const canvas = document.createElement('canvas')
  canvas.width = PRINT_WIDTH
  canvas.height = PRINT_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Perangkat tidak mendukung pemrosesan foto.')

  const { image, url } = await loadBlobImage(strip)
  try {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, PRINT_WIDTH, PRINT_HEIGHT)

    if (variant === 'download') {
      const stripWidth = PRINT_WIDTH / 2
      context.drawImage(image, 0, 0, stripWidth, PRINT_HEIGHT)
      context.drawImage(image, stripWidth, 0, stripWidth, PRINT_HEIGHT)
      return await sheetBlob(canvas)
    }

    const marginsPx = resolveSafeMarginsPx(options.margins)
    const cutX = PRINT_WIDTH / 2
    const topMarkLength = Math.max(marginsPx.top, Math.round((7 / 25.4) * 300))
    const bottomMarkLength = Math.max(marginsPx.bottom, Math.round((6.6 / 25.4) * 300))

    const availableHeight = PRINT_HEIGHT - marginsPx.top - marginsPx.bottom
    const maxHalfWidth = Math.min(cutX - marginsPx.left, cutX - marginsPx.right)
    const stripWidth = Math.min(
      maxHalfWidth,
      availableHeight * (TEMPLATE_WIDTH / TEMPLATE_HEIGHT),
    )
    const stripHeight = stripWidth * (TEMPLATE_HEIGHT / TEMPLATE_WIDTH)
    const top = marginsPx.top + (availableHeight - stripHeight) / 2
    context.drawImage(image, marginsPx.left, top, stripWidth, stripHeight)
    context.drawImage(image, cutX, top, stripWidth, stripHeight)

    // Garis potong berada tepat di tengah lembar 4R, di antara kedua strip.
    context.save()
    context.beginPath()
    context.lineWidth = 1
    context.strokeStyle = 'rgba(35, 35, 35, 0.9)'

    context.moveTo(cutX, 0)
    context.lineTo(cutX, topMarkLength)

    context.moveTo(cutX, PRINT_HEIGHT - bottomMarkLength)
    context.lineTo(cutX, PRINT_HEIGHT)

    context.stroke()
    context.restore()
  } finally {
    URL.revokeObjectURL(url)
  }

  return sheetBlob(canvas)
}
