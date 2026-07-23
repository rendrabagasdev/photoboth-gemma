import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { PhotoFrame } from '../../frames/domain/photo-frame'
import type { LivePhotoClip } from '../../sessions/domain/booth-session'
import { useObjectUrl } from '../../../shared/presentation/use-object-url'
import {
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
  clampPhotoTransform,
  resolveFrameSlots,
  type PhotoTransform,
} from '../domain/template-layout'
import { TemplateDecoration } from './template-decoration'

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

function LivePhotoLayer({
  clip,
  index,
  playing,
  mediaStyle,
  onToggle,
  onEnded,
}: {
  clip?: LivePhotoClip
  index: number
  playing: boolean
  mediaStyle: CSSProperties
  onToggle: () => void
  onEnded: () => void
}) {
  const liveUrl = useObjectUrl(clip?.videoBlob)
  if (!liveUrl) return null

  return (
    <>
      {playing && (
        <video
          className="live-photo-video"
          src={liveUrl}
          autoPlay
          muted
          playsInline
          onEnded={onEnded}
          style={mediaStyle}
        />
      )}
      <button
        className="editor-live"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggle}
        aria-label={`Putar Live Photo ${index + 1}`}
      >
        ●
      </button>
    </>
  )
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
  const slots = resolveFrameSlots(frame)

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

    const slot = slots[drag.slot]
    if (!slot) return
    const radians = ((slot.rotation ?? 0) * Math.PI) / 180
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    const localX = Math.cos(radians) * deltaX + Math.sin(radians) * deltaY
    const localY = -Math.sin(radians) * deltaX + Math.cos(radians) * deltaY
    onTransformChange(
      drag.slot,
      clampPhotoTransform({
        ...drag.origin,
        offsetX: drag.origin.offsetX + localX / event.currentTarget.clientWidth,
        offsetY: drag.origin.offsetY + localY / event.currentTarget.clientHeight,
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
        {slots.map((slot, index) => {
          const transform = transforms[index]
          const photo = photos[index]
          if (!transform || !photo) return null
          const mediaStyle = {
            width: `${transform.scale * 100}%`,
            height: `${transform.scale * 100}%`,
            left: `${50 + transform.offsetX * 100}%`,
            top: `${50 + transform.offsetY * 100}%`,
          }

          return (
            <div
              className={`editable-photo-slot ${activeSlot === index ? 'active' : ''}`}
              key={index}
              style={{
                left: `${(slot.x / TEMPLATE_WIDTH) * 100}%`,
                top: `${(slot.y / TEMPLATE_HEIGHT) * 100}%`,
                width: `${(slot.width / TEMPLATE_WIDTH) * 100}%`,
                height: `${(slot.height / TEMPLATE_HEIGHT) * 100}%`,
                borderRadius: `${((slot.borderRadius ?? 0) / slot.width) * 100}% / ${((slot.borderRadius ?? 0) / slot.height) * 100}%`,
                transform: `rotate(${slot.rotation ?? 0}deg)`,
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
                style={mediaStyle}
              />
              <LivePhotoLayer
                clip={livePhotos[index]}
                index={index}
                playing={playingSlot === index}
                mediaStyle={mediaStyle}
                onToggle={() => setPlayingSlot(playingSlot === index ? undefined : index)}
                onEnded={() => setPlayingSlot(undefined)}
              />
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

        {overlayUrl && <img className="full-template-overlay" src={overlayUrl} alt="" />}
        <TemplateDecoration frame={frame} />
      </div>

      <div className="editor-controls">
        <button type="button" onClick={() => zoom(-0.08)} aria-label="Perkecil foto">−</button>
        <span>{activeSlot + 1}</span>
        <button type="button" onClick={() => zoom(0.08)} aria-label="Perbesar foto">＋</button>
      </div>
    </div>
  )
}
