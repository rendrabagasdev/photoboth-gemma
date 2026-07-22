import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PhotoFrame } from '../../frames/domain/photo-frame'
import type { LivePhotoClip } from '../../sessions/domain/booth-session'
import { useObjectUrl } from '../../../shared/presentation/use-object-url'
import {
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  clampPhotoTransform,
  templateSlots,
  type PhotoTransform,
} from '../domain/template-layout'

type PhotoTemplateEditorProps = {
  photos: string[]
  livePhotos: Array<LivePhotoClip | undefined>
  frame: PhotoFrame
  transforms: PhotoTransform[]
  onTransformChange: (slot: number, transform: PhotoTransform) => void
  onRetake: (slot: number) => void
}

type DragState = {
  pointerId: number
  slot: number
  startX: number
  startY: number
  origin: PhotoTransform
}

export function PhotoTemplateEditor({
  photos,
  livePhotos,
  frame,
  transforms,
  onTransformChange,
  onRetake,
}: PhotoTemplateEditorProps) {
  const dragRef = useRef<DragState | undefined>(undefined)
  const [activeSlot, setActiveSlot] = useState(0)
  const [playingSlot, setPlayingSlot] = useState<number>()
  const overlayUrl = useObjectUrl(frame.imageBlob)
  const liveUrlOne = useObjectUrl(livePhotos[0]?.videoBlob)
  const liveUrlTwo = useObjectUrl(livePhotos[1]?.videoBlob)
  const liveUrlThree = useObjectUrl(livePhotos[2]?.videoBlob)
  const liveUrls = [liveUrlOne, liveUrlTwo, liveUrlThree]

  const beginDrag = (slot: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const transform = transforms[slot]
    if (!transform) return

    setActiveSlot(slot)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      slot,
      startX: event.clientX,
      startY: event.clientY,
      origin: transform,
    }
  }

  const movePhoto = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const bounds = event.currentTarget.getBoundingClientRect()
    onTransformChange(
      drag.slot,
      clampPhotoTransform({
        ...drag.origin,
        offsetX: drag.origin.offsetX + (event.clientX - drag.startX) / bounds.width,
        offsetY: drag.origin.offsetY + (event.clientY - drag.startY) / bounds.height,
      }),
    )
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = undefined
    }
  }

  const zoom = (amount: number) => {
    const transform = transforms[activeSlot]
    if (!transform) return
    onTransformChange(activeSlot, clampPhotoTransform({ ...transform, scale: transform.scale + amount }))
  }

  return (
    <div className="template-editor-shell">
      <div
        className="template-editor"
        style={{
          '--template-accent': frame.accent,
          '--template-soft': frame.accentSoft,
          aspectRatio: `${TEMPLATE_WIDTH} / ${TEMPLATE_HEIGHT}`,
        } as React.CSSProperties}
      >
        {templateSlots.map((slot, index) => {
          const transform = transforms[index]
          const photo = photos[index]
          const liveUrl = liveUrls[index]
          if (!transform || !photo) return null

          return (
            <div
              className={`editable-photo-slot ${activeSlot === index ? 'active' : ''}`}
              key={index}
              style={{
                left: `${(slot.x / TEMPLATE_WIDTH) * 100}%`,
                top: `${(slot.y / TEMPLATE_HEIGHT) * 100}%`,
                width: `${(slot.width / TEMPLATE_WIDTH) * 100}%`,
                height: `${(slot.height / TEMPLATE_HEIGHT) * 100}%`,
              }}
              onPointerDown={(event) => beginDrag(index, event)}
              onPointerMove={movePhoto}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="group"
              aria-label={`Atur posisi foto ${index + 1}`}
            >
              <img
                src={photo}
                alt={`Foto ${index + 1}`}
                draggable={false}
                style={{
                  width: `${transform.scale * 100}%`,
                  height: `${transform.scale * 100}%`,
                  left: `${50 + transform.offsetX * 100}%`,
                  top: `${50 + transform.offsetY * 100}%`,
                }}
              />
              {playingSlot === index && liveUrl && (
                <video
                  className="live-photo-video"
                  src={liveUrl}
                  autoPlay
                  muted
                  playsInline
                  onEnded={() => setPlayingSlot(undefined)}
                  style={{
                    width: `${transform.scale * 100}%`,
                    height: `${transform.scale * 100}%`,
                    left: `${50 + transform.offsetX * 100}%`,
                    top: `${50 + transform.offsetY * 100}%`,
                  }}
                />
              )}
              {liveUrl && (
                <button
                  className="editor-live"
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setPlayingSlot(playingSlot === index ? undefined : index)}
                  aria-label={`Putar Live Photo ${index + 1}`}
                >
                  ●
                </button>
              )}
              <button
                className="editor-retake"
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onRetake(index)}
                aria-label={`Ambil ulang foto ${index + 1}`}
              >
                ↻
              </button>
            </div>
          )
        })}

        {frame.kind === 'preset' && (
          <div className="preset-full-template" aria-hidden="true">
            <span>0{activeSlot + 1}</span>
          </div>
        )}
        {overlayUrl && <img className="full-template-overlay" src={overlayUrl} alt="" />}
        <strong className="template-brand" aria-hidden="true">TOBFEST</strong>
      </div>

      <div className="editor-controls">
        <button type="button" onClick={() => zoom(-0.08)} aria-label="Perkecil foto">−</button>
        <span>{activeSlot + 1}</span>
        <button type="button" onClick={() => zoom(0.08)} aria-label="Perbesar foto">＋</button>
      </div>
    </div>
  )
}
