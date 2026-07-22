const JPEG_SOI = [0xff, 0xd8]
const XMP_APP1_MARKER = [0xff, 0xe1]
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0'

function motionPhotoMimeType(video: Blob): 'video/mp4' | 'video/quicktime' {
  if (video.type.includes('mp4')) return 'video/mp4'
  if (video.type.includes('quicktime')) return 'video/quicktime'
  throw new Error('Motion Photo JPG memerlukan rekaman MP4.')
}

function createXmp(videoLength: number, videoMimeType: string): string {
  return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:Camera="http://ns.google.com/photos/1.0/camera/"
      xmlns:Container="http://ns.google.com/photos/1.0/container/"
      xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
      Camera:MotionPhoto="1"
      Camera:MotionPhotoVersion="1"
      Camera:MotionPhotoPresentationTimestampUs="1500000">
      <Container:Directory>
        <rdf:Seq>
          <rdf:li rdf:parseType="Resource">
            <Container:Item Item:Mime="image/jpeg" Item:Semantic="Primary" Item:Length="0" Item:Padding="0" />
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <Container:Item Item:Mime="${videoMimeType}" Item:Semantic="MotionPhoto" Item:Length="${videoLength}" />
          </rdf:li>
        </rdf:Seq>
      </Container:Directory>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

function createXmpSegment(xmp: string): Uint8Array {
  const payload = new TextEncoder().encode(`${XMP_HEADER}${xmp}`)
  const segmentLength = payload.length + 2
  if (segmentLength > 0xffff) throw new Error('Metadata Motion Photo terlalu besar.')

  const segment = new Uint8Array(payload.length + 4)
  segment.set(XMP_APP1_MARKER, 0)
  segment[2] = segmentLength >> 8
  segment[3] = segmentLength & 0xff
  segment.set(payload, 4)
  return segment
}

export async function composeMotionPhoto(photo: Blob, video: Blob): Promise<Blob> {
  const photoBytes = new Uint8Array(await photo.arrayBuffer())

  if (photoBytes[0] !== JPEG_SOI[0] || photoBytes[1] !== JPEG_SOI[1]) {
    throw new Error('Foto utama harus berformat JPEG.')
  }
  if (!video.size) throw new Error('Rekaman Motion Photo kosong.')

  const videoMimeType = motionPhotoMimeType(video)
  const xmpSegment = createXmpSegment(createXmp(video.size, videoMimeType))

  return new Blob([
    photo.slice(0, 2),
    xmpSegment.buffer as ArrayBuffer,
    photo.slice(2),
    video,
  ], { type: 'image/jpeg' })
}
