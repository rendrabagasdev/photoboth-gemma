import { PRINT_HEIGHT, PRINT_WIDTH, TEMPLATE_HEIGHT, TEMPLATE_WIDTH } from '../domain/template-layout'

const SAFE_MARGIN_PX = Math.round((2 / 25.4) * 300)

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

export async function composePhotoSheet(strip: Blob): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = PRINT_WIDTH
  canvas.height = PRINT_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Perangkat tidak mendukung pemrosesan foto.')

  const { image, url } = await loadBlobImage(strip)
  try {
    const cutX = PRINT_WIDTH / 2
    const markLength = Math.round((6 / 25.4) * 300)

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, PRINT_WIDTH, PRINT_HEIGHT)
    const availableWidth = PRINT_WIDTH - SAFE_MARGIN_PX * 2
    const availableHeight = PRINT_HEIGHT - SAFE_MARGIN_PX * 2
    const stripWidth = Math.min(
      availableWidth / 2,
      availableHeight * (TEMPLATE_WIDTH / TEMPLATE_HEIGHT),
    )
    const stripHeight = stripWidth * (TEMPLATE_HEIGHT / TEMPLATE_WIDTH)
    const top = (PRINT_HEIGHT - stripHeight) / 2
    context.drawImage(image, SAFE_MARGIN_PX, top, stripWidth, stripHeight)
    context.drawImage(image, PRINT_WIDTH / 2, top, stripWidth, stripHeight)

    // Garis potong berada tepat di tengah lembar 4R, di antara kedua strip.
    context.save()
    context.beginPath()
    context.lineWidth = 3
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

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Lembar 4R gagal dibuat.')),
      'image/jpeg',
      0.94,
    )
  })
}
