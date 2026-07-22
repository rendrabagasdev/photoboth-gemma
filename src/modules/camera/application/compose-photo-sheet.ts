import { PRINT_HEIGHT, PRINT_WIDTH, TEMPLATE_HEIGHT, TEMPLATE_WIDTH } from '../domain/template-layout'

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
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, PRINT_WIDTH, PRINT_HEIGHT)
    context.drawImage(image, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT)
    context.drawImage(image, TEMPLATE_WIDTH, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT)
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
