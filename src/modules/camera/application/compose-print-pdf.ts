import { PRINT_HEIGHT, PRINT_WIDTH } from '../domain/template-layout'

const PAGE_WIDTH_PT = (102 / 25.4) * 72
const PAGE_HEIGHT_PT = (152 / 25.4) * 72

function encode(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value)
}

function join(parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const size = parts.reduce((total, part) => total + part.byteLength, 0)
  const output = new Uint8Array(new ArrayBuffer(size))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

export async function composePrintPdf(photoSheet: Blob): Promise<Blob> {
  if (photoSheet.type !== 'image/jpeg') {
    throw new Error('Format hasil cetak tidak didukung.')
  }

  const jpeg = new Uint8Array(await photoSheet.arrayBuffer())
  const pageWidth = PAGE_WIDTH_PT.toFixed(6)
  const pageHeight = PAGE_HEIGHT_PT.toFixed(6)
  const content = encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Photo Do\nQ\n`)
  const objects = [
    encode('<< /Type /Catalog /Pages 2 0 R >>'),
    encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /CropBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Photo 4 0 R >> >> /Contents 5 0 R >>`),
    join([
      encode(`<< /Type /XObject /Subtype /Image /Width ${PRINT_WIDTH} /Height ${PRINT_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`),
      jpeg,
      encode('\nendstream'),
    ]),
    join([
      encode(`<< /Length ${content.byteLength} >>\nstream\n`),
      content,
      encode('endstream'),
    ]),
  ]

  const parts: Uint8Array<ArrayBuffer>[] = [encode('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')]
  const offsets = [0]
  let byteOffset = parts[0].byteLength

  objects.forEach((object, index) => {
    offsets.push(byteOffset)
    const wrapped = join([
      encode(`${index + 1} 0 obj\n`),
      object,
      encode('\nendobj\n'),
    ])
    parts.push(wrapped)
    byteOffset += wrapped.byteLength
  })

  const xrefOffset = byteOffset
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n')
  parts.push(encode(xref))

  return new Blob([join(parts)], { type: 'application/pdf' })
}
