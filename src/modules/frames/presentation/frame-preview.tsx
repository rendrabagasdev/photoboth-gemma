import type { PhotoFrame } from '../domain/photo-frame'
import { useObjectUrl } from '../../../shared/presentation/use-object-url'
import { TemplateDecoration } from '../../camera/presentation/template-decoration'
import { TEMPLATE_HEIGHT, TEMPLATE_WIDTH, resolveFrameSlots } from '../../camera/domain/template-layout'

type FramePreviewProps = {
  frame: PhotoFrame
  selected?: boolean
  compact?: boolean
  photos?: string[]
}

export function FramePreview({ frame, selected = false, compact = false, photos = [] }: FramePreviewProps) {
  const overlayUrl = useObjectUrl(frame.imageBlob)
  const slots = resolveFrameSlots(frame)

  return (
    <div
      className={`frame-artwork ${compact ? 'compact' : ''} ${selected ? 'selected' : ''}`}
      style={{ '--frame-accent': frame.accent, '--frame-soft': frame.accentSoft } as React.CSSProperties}
    >
      {slots.map((slot, index) => (
        <div
          className="mini-photo"
          key={index}
          style={{
            left: `${(slot.x / TEMPLATE_WIDTH) * 100}%`,
            top: `${(slot.y / TEMPLATE_HEIGHT) * 100}%`,
            width: `${(slot.width / TEMPLATE_WIDTH) * 100}%`,
            height: `${(slot.height / TEMPLATE_HEIGHT) * 100}%`,
            borderRadius: `${((slot.borderRadius ?? 0) / slot.width) * 100}% / ${((slot.borderRadius ?? 0) / slot.height) * 100}%`,
            transform: `rotate(${slot.rotation ?? 0}deg)`,
          }}
        >
          {photos[index] && <img src={photos[index]} alt="" />}
        </div>
      ))}
      {overlayUrl && <img src={overlayUrl} alt="" className="uploaded-overlay" />}
      <TemplateDecoration frame={frame} />
    </div>
  )
}
