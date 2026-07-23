import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FramePhotoSlot } from '../../frames/domain/photo-frame'
import { useObjectUrl } from '../../../shared/presentation/use-object-url'

const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 1800
const MIN_WIDTH = 120
const MIN_HEIGHT = 90
const DEFAULT_PHOTO_RATIO = 4 / 5
const SNAP_SIZE = 20
const MAX_HISTORY = 50

type DragState = {
  index: number
  mode: 'move' | 'resize'
  pointerId: number
  startX: number
  startY: number
  origin: FramePhotoSlot
}

type FrameSlotEditorProps = {
  image: Blob
  slots: FramePhotoSlot[]
  onChange: (slots: FramePhotoSlot[]) => void
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function FrameSlotEditor({ image, slots, onChange }: FrameSlotEditorProps) {
  const imageUrl = useObjectUrl(image)
  const rootRef = useRef<HTMLElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | undefined>(undefined)
  const copiedSlotRef = useRef<FramePhotoSlot | undefined>(undefined)
  const historyRef = useRef<FramePhotoSlot[][]>([])
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [snapEnabled, setSnapEnabled] = useState(true)

  const cloneSlots = (value: FramePhotoSlot[]): FramePhotoSlot[] => (
    value.map((slot) => ({ ...slot }))
  )

  const remember = () => {
    historyRef.current.push(cloneSlots(slots))
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
  }

  const commit = (next: FramePhotoSlot[]) => {
    remember()
    onChange(next)
  }

  const snap = (value: number, precision: boolean): number => {
    if (precision || !snapEnabled) return Math.round(value)
    return Math.round(value / SNAP_SIZE) * SNAP_SIZE
  }

  const begin = (
    index: number,
    mode: DragState['mode'],
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const slot = slots[index]
    if (!slot) return
    event.preventDefault()
    event.stopPropagation()
    rootRef.current?.focus({ preventScroll: true })
    setSelectedSlot(index)
    remember()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      index,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...slot },
    }
  }

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    const bounds = editorRef.current?.getBoundingClientRect()
    if (!drag || !bounds || drag.pointerId !== event.pointerId) return
    event.preventDefault()

    const deltaX = ((event.clientX - drag.startX) / bounds.width) * CANVAS_WIDTH
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * CANVAS_HEIGHT
    let nextSlot: FramePhotoSlot

    if (drag.mode === 'move') {
      nextSlot = {
        ...drag.origin,
        x: clamp(snap(drag.origin.x + deltaX, event.shiftKey), 0, CANVAS_WIDTH - drag.origin.width),
        y: clamp(snap(drag.origin.y + deltaY, event.shiftKey), 0, CANVAS_HEIGHT - drag.origin.height),
      }
    } else {
      const width = clamp(
        snap(drag.origin.width + deltaX, event.shiftKey),
        MIN_WIDTH,
        CANVAS_WIDTH - drag.origin.x,
      )
      const height = clamp(
        snap(drag.origin.height + deltaY, event.shiftKey),
        MIN_HEIGHT,
        CANVAS_HEIGHT - drag.origin.y,
      )
      nextSlot = {
        ...drag.origin,
        width,
        height,
        borderRadius: Math.min(
          drag.origin.borderRadius ?? 0,
          Math.round(Math.min(width, height) / 2),
        ),
      }
    }

    onChange(slots.map((slot, index) => index === drag.index ? nextSlot : slot))
  }

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined
  }

  const addSlot = () => {
    if (slots.length >= 6) return
    const width = 240
    const height = width / DEFAULT_PHOTO_RATIO
    const column = slots.length % 2
    const row = Math.floor(slots.length / 2)
    const x = 40 + column * 280
    const y = 100 + row * 540
    commit([...slots, { x, y, width, height, borderRadius: 0 }])
    setSelectedSlot(slots.length)
  }

  const removeSlot = (index: number) => {
    commit(slots.filter((_, slotIndex) => slotIndex !== index))
    setSelectedSlot((current) => Math.max(0, Math.min(current, slots.length - 2)))
  }

  const reorder = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= slots.length) return
    const next = [...slots]
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next)
    setSelectedSlot((current) => current === index ? target : current === target ? index : current)
  }

  const activeSlot = slots[selectedSlot]
  const maxRadius = activeSlot
    ? Math.floor(Math.min(activeSlot.width, activeSlot.height) / 2)
    : 0

  const changeRadius = (borderRadius: number) => {
    onChange(slots.map((slot, index) => (
      index === selectedSlot ? { ...slot, borderRadius } : slot
    )))
  }

  const undo = () => {
    const previous = historyRef.current.pop()
    if (!previous) return
    onChange(cloneSlots(previous))
    setSelectedSlot((current) => Math.max(0, Math.min(current, previous.length - 1)))
  }

  const copySelected = () => {
    const slot = slots[selectedSlot]
    if (slot) copiedSlotRef.current = { ...slot }
  }

  const pasteSelected = () => {
    const copied = copiedSlotRef.current
    if (!copied || slots.length >= 6) return
    const pasted = {
      ...copied,
      x: clamp(copied.x + SNAP_SIZE, 0, CANVAS_WIDTH - copied.width),
      y: clamp(copied.y + SNAP_SIZE, 0, CANVAS_HEIGHT - copied.height),
    }
    commit([...slots, pasted])
    copiedSlotRef.current = { ...pasted }
    setSelectedSlot(slots.length)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return
    const key = event.key.toLowerCase()
    if (key === 'c') copySelected()
    else if (key === 'v') pasteSelected()
    else if (key === 'z' && !event.shiftKey) undo()
    else return
    event.preventDefault()
  }

  return (
    <section
      className="slot-editor"
      aria-label="Tentukan area foto"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="slot-editor-heading">
        <div><strong>Area foto bebas</strong><small>Geser dan resize bebas. Tahan Shift untuk presisi.</small></div>
        <div className="slot-editor-actions">
          <label className="slot-snap-toggle">
            <input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />
            <span /> Snap
          </label>
          <button type="button" onClick={addSlot} disabled={slots.length >= 6}>＋ Area</button>
        </div>
      </div>

      <p className="slot-editor-shortcuts">⌘/Ctrl C salin · ⌘/Ctrl V tempel · ⌘/Ctrl Z urungkan</p>

      <div className="slot-editor-previews">
        <div className="slot-editor-preview-panel">
          <small>EDITOR AREA</small>
          <div className={`slot-editor-canvas ${snapEnabled ? 'snap-on' : ''}`} ref={editorRef}>
            {imageUrl && <img src={imageUrl} alt="Preview PNG frame" />}
            {slots.map((slot, index) => (
              <div
                className={`slot-editor-box ${selectedSlot === index ? 'selected' : ''}`}
                key={index}
                style={{
                  left: `${(slot.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(slot.y / CANVAS_HEIGHT) * 100}%`,
                  width: `${(slot.width / CANVAS_WIDTH) * 100}%`,
                  height: `${(slot.height / CANVAS_HEIGHT) * 100}%`,
                  borderRadius: `${((slot.borderRadius ?? 0) / slot.width) * 100}% / ${((slot.borderRadius ?? 0) / slot.height) * 100}%`,
                }}
                onPointerDown={(event) => begin(index, 'move', event)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              >
                <span>{index + 1}</span>
                <i
                  onPointerDown={(event) => begin(index, 'resize', event)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="slot-editor-preview-panel">
          <small>PREVIEW HASIL</small>
          <div className="slot-result-preview" aria-label="Preview hasil frame">
            {imageUrl && <img src={imageUrl} alt="" />}
            {slots.map((slot, index) => (
              <div
                className={`slot-result-photo sample-${(index % 4) + 1}`}
                key={index}
                style={{
                  left: `${(slot.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(slot.y / CANVAS_HEIGHT) * 100}%`,
                  width: `${(slot.width / CANVAS_WIDTH) * 100}%`,
                  height: `${(slot.height / CANVAS_HEIGHT) * 100}%`,
                  borderRadius: `${((slot.borderRadius ?? 0) / slot.width) * 100}% / ${((slot.borderRadius ?? 0) / slot.height) * 100}%`,
                }}
              >
                <span>{index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {slots.length === 0 && <p className="slot-editor-empty">Tambahkan minimal satu area foto.</p>}
      {activeSlot && (
        <label className="slot-radius-control">
          <span>Sudut foto {selectedSlot + 1}</span>
          <input
            type="range"
            min="0"
            max={maxRadius}
            step="4"
            value={Math.min(activeSlot.borderRadius ?? 0, maxRadius)}
            onPointerDown={remember}
            onChange={(event) => changeRadius(Number(event.target.value))}
          />
          <output>{Math.round(activeSlot.borderRadius ?? 0)} px</output>
        </label>
      )}
      {slots.length > 0 && (
        <div className="slot-editor-order" aria-label="Urutan foto">
          {slots.map((_, index) => (
            <div key={index}>
              <strong>Foto {index + 1}</strong>
              <button type="button" onClick={() => reorder(index, -1)} disabled={index === 0} aria-label={`Naikkan foto ${index + 1}`}>↑</button>
              <button type="button" onClick={() => reorder(index, 1)} disabled={index === slots.length - 1} aria-label={`Turunkan foto ${index + 1}`}>↓</button>
              <button type="button" onClick={() => removeSlot(index)} aria-label={`Hapus area foto ${index + 1}`}>×</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
