import { motion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
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
  cameraFilter?: 'normal' | 'warm' | 'mono'
  frame: PhotoFrame
  transforms: PhotoTransform[]
  photoAssignments?: number[]
  onPhotoAssignmentChange?: (slot: number, photoIndex: number) => void
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
  cameraFilter = 'normal',
  frame,
  transforms,
  photoAssignments,
  onPhotoAssignmentChange,
  onTransformChange,
}: PhotoTemplateEditorProps) {
  const dragRef = useRef<DragState | undefined>(undefined)
  const slotRefs = useRef<Array<HTMLDivElement | null>>([])
  const [activeSlot, setActiveSlot] = useState(0)
  const [playingSlot, setPlayingSlot] = useState<number>()
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const [draggedPhoto, setDraggedPhoto] = useState<{ pointerId: number; photoIndex: number; x: number; y: number } | undefined>()
  const overlayUrl = useObjectUrl(frame.imageBlob)
  const slots = resolveFrameSlots(frame)
  const effectiveAssignments = photoAssignments && photoAssignments.length === slots.length
    ? photoAssignments
    : Array.from({ length: slots.length }, (_, index) => Math.min(index, Math.max(photos.length - 1, 0)))
  const filterStyle = cameraFilter === 'warm'
    ? 'sepia(0.2) saturate(1.22) contrast(1.04)'
    : cameraFilter === 'mono'
      ? 'grayscale(1) contrast(1.08)'
      : 'none'

  useEffect(() => {
    if (!draggedPhoto) return

    const handleMove = (event: PointerEvent) => {
      setDraggedPhoto((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)

      const nextHover = slots.reduce<number | null>((match, _, index) => {
        const element = slotRefs.current[index]
        if (!element) return match
        const rect = element.getBoundingClientRect()
        if (
          event.clientX >= rect.left
          && event.clientX <= rect.right
          && event.clientY >= rect.top
          && event.clientY <= rect.bottom
        ) {
          return index
        }
        return match
      }, null)

      setHoverSlot(nextHover)
    }

    const handleUp = (event: PointerEvent) => {
      const slotIndex = slots.reduce<number | null>((match, _, index) => {
        const element = slotRefs.current[index]
        if (!element) return match
        const rect = element.getBoundingClientRect()
        if (
          event.clientX >= rect.left
          && event.clientX <= rect.right
          && event.clientY >= rect.top
          && event.clientY <= rect.bottom
        ) {
          return index
        }
        return match
      }, null)

      if (slotIndex !== null && onPhotoAssignmentChange) {
        onPhotoAssignmentChange(slotIndex, draggedPhoto.photoIndex)
        setActiveSlot(slotIndex)
      }

      setDraggedPhoto(undefined)
      setHoverSlot(null)
    }

    const handleCancel = () => {
      setDraggedPhoto(undefined)
      setHoverSlot(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
    }
  }, [draggedPhoto, onPhotoAssignmentChange, slots])

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
    const nextScale = clampPhotoTransform({
      ...drag.origin,
      scale: drag.origin.scale + (deltaY / 280),
      offsetX: drag.origin.offsetX + localX / event.currentTarget.clientWidth,
      offsetY: drag.origin.offsetY + localY / event.currentTarget.clientHeight,
    })
    onTransformChange(drag.slot, nextScale)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = undefined
    }
  }

  const beginPhotoDrag = (photoIndex: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggedPhoto({ pointerId: event.pointerId, photoIndex, x: event.clientX, y: event.clientY })
    setHoverSlot(null)
  }

  const releasePhotoDrag = (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!draggedPhoto || draggedPhoto.pointerId !== event.pointerId) return
    setHoveredPhoto(null)
  }

  const setHoveredPhoto = (next: number | null) => {
    setHoverSlot(next)
  }

  return (
    <div className="flex h-full w-full items-center justify-between gap-8 mt-10">
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 320, damping: 24, mass: 0.6 }}
        className="relative flex w-68 shrink-0 justify-between isolate overflow-hidden"
        style={{
          '--template-accent': frame.accent,
          '--template-soft': frame.accentSoft,
          aspectRatio: `${TEMPLATE_WIDTH} / ${TEMPLATE_HEIGHT}`,
        } as React.CSSProperties}
      >
        {slots.map((slot, index) => {
          const transform = transforms[index]
          const sourcePhotoIndex = effectiveAssignments[index] ?? index
          const photo = photos[sourcePhotoIndex]
          if (!transform || !photo) return null
          const mediaStyle = {
            width: `${transform.scale * 100}%`,
            height: `${transform.scale * 100}%`,
            left: `${50 + transform.offsetX * 100}%`,
            top: `${50 + transform.offsetY * 100}%`,
          }
          const isActive = activeSlot === index
          const isTargeting = hoverSlot === index

          return (
            <motion.div
              layout
              key={index}
              data-slot-index={index}
              ref={(element) => {
                slotRefs.current[index] = element
              }}
              className={`absolute z-1 overflow-hidden shadow-sm select-none touch-none ${isActive ? 'z-2  ' : 'border-transparent '
                } ${isTargeting ? 'border-[var(--template-accent)] ' : ''}`}
              style={{
                left: `${(slot.x / TEMPLATE_WIDTH) * 100}%`,
                top: `${(slot.y / TEMPLATE_HEIGHT) * 100}%`,
                width: `${(slot.width / TEMPLATE_WIDTH) * 100}%`,
                height: `${(slot.height / TEMPLATE_HEIGHT) * 100}%`,
                transform: `rotate(${slot.rotation ?? 0}deg)`,
                cursor: 'grab',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
              animate={{ scale: isTargeting ? 1.01 : 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24 }}
              whileTap={{ scale: 0.99 }}
              onPointerDown={(event) => beginDrag(index, event)}
              onPointerMove={movePhoto}
              onPointerUp={(event) => {
                endDrag(event)
                releasePhotoDrag(event)
              }}
              onPointerCancel={(event) => {
                endDrag(event)
                releasePhotoDrag(event)
              }}
              role="group"
              aria-label={`Atur posisi foto ${index + 1}`}
            >
              <img
                src={photo}
                alt={`Foto ${index + 1}`}
                draggable={false}
                style={{
                  ...mediaStyle,
                  filter: filterStyle,
                  position: 'absolute',
                  maxWidth: 'none',
                  objectFit: 'cover',
                  zIndex: 0,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                }}
              />
              <LivePhotoLayer
                clip={livePhotos[sourcePhotoIndex]}
                index={sourcePhotoIndex}
                playing={playingSlot === index}
                mediaStyle={mediaStyle}
                onToggle={() => setPlayingSlot(playingSlot === index ? undefined : index)}
                onEnded={() => setPlayingSlot(undefined)}
              />
            </motion.div>
          )
        })}

        {overlayUrl && <img className="pointer-events-none absolute inset-0 z-[10] h-full w-full" src={overlayUrl} alt="" />}
        <TemplateDecoration frame={frame} />
      </motion.div>

      <motion.div layout className="flex w-58 shrink-0 flex-col items-end gap-6 overflow-x-auto" aria-label="Daftar foto yang diambil">
        {Array.from({ length: Math.min(photos.length, 4) }, (_, photoIndex) => (
          <motion.button
            key={photoIndex}
            type="button"
            className="group relative aspect-5/4 w-full shrink-0 touch-none select-none overflow-hidden"
            style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => beginPhotoDrag(photoIndex, event)}
            onPointerMove={(event) => {
              if (draggedPhoto?.pointerId === event.pointerId) {
                setDraggedPhoto((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)
              }
            }}
            onPointerUp={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onPointerCancel={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            aria-label={`Pilih foto ${photoIndex + 1}`}
          >
            <img src={photos[photoIndex]} alt={`Foto ${photoIndex + 1}`} className="h-full w-full object-cover" style={{ filter: filterStyle }} />
          </motion.button>
        ))}
      </motion.div>

      {draggedPhoto && (
        <motion.div
          initial={{ opacity: 0.8, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="pointer-events-none fixed left-0 top-0 z-50 h-[90px] w-[76px] touch-none select-none overflow-hidden  "
          style={{ left: draggedPhoto.x, top: draggedPhoto.y, transform: 'translate(-50%, -50%)', touchAction: 'none', WebkitUserSelect: 'none' }}
          aria-hidden="true"
        >
          <img src={photos[draggedPhoto.photoIndex]} alt="" className="h-full w-full object-cover" />
        </motion.div>
      )}
    </div>
  )
}
