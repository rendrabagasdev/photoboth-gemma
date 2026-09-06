import { PRINT_HEIGHT, PRINT_WIDTH, TEMPLATE_HEIGHT, TEMPLATE_WIDTH } from '../domain/template-layout'

const PRINT_MARGIN_TOP_PX = Math.round((2 / 25.4) * 300)
const PRINT_MARGIN_RIGHT_PX = Math.round((2 / 25.4) * 300)
const PRINT_MARGIN_BOTTOM_PX = 25
const PRINT_MARGIN_LEFT_PX = Math.round((2 / 25.4) * 300)

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
 * `print` menyiapkan lembar untuk printer: strip diberi margin aman dan garis
 * potong. `download` mengisi kanvas penuh tanpa margin maupun garis potong,
 * karena hasil unduhan tidak pernah dipotong secara fisik.
 */
export type PhotoSheetVariant = 'print' | 'download'

export type ComposePhotoSheetOptions = {
  variant?: PhotoSheetVariant
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

    const cutX = PRINT_WIDTH / 2
    const markLength = Math.round((6 / 25.4) * 300)

    const stripAreaWidth = PRINT_WIDTH / 2
    const availableWidth = stripAreaWidth - PRINT_MARGIN_LEFT_PX - PRINT_MARGIN_RIGHT_PX
    const availableHeight = PRINT_HEIGHT - PRINT_MARGIN_TOP_PX - PRINT_MARGIN_BOTTOM_PX
    const stripWidth = Math.min(
      availableWidth,
      availableHeight * (TEMPLATE_WIDTH / TEMPLATE_HEIGHT),
    )
    const stripHeight = stripWidth * (TEMPLATE_HEIGHT / TEMPLATE_WIDTH)
    const top = PRINT_MARGIN_TOP_PX
    context.drawImage(image, PRINT_MARGIN_LEFT_PX, top, stripWidth, stripHeight)
    context.drawImage(image, stripAreaWidth + PRINT_MARGIN_LEFT_PX, top, stripWidth, stripHeight)

    // Garis potong berada tepat di tengah lembar 4R, di antara kedua strip.
    context.save()
    context.beginPath()
    context.lineWidth = 1
    context.strokeStyle = 'rgba(35, 35, 35, 0.9)'

    context.moveTo(cutX, 0)
    context.lineTo(cutX, markLength)

    context.moveTo(cutX, PRINT_HEIGHT - markLength)
    context.lineTo(cutX, PRINT_HEIGHT)

    context.stroke()
    context.restore()
  } finally {
    URL.revokeObjectURL(url)
  }

  return sheetBlob(canvas)
}
