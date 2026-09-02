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
      className={[
        'relative isolate bg-[#f1dfe6]',
        'aspect-1/3 w-full',
        compact ? 'compact-preview' : '',
        selected ? 'ring-2 ring-[#D7D6D6]/70' : '',
      ].join(' ')}
      style={{
        backgroundColor: frame.accentSoft ?? '#f1dfe6',
      }}
    >
      {slots.map((slot, index) => (
        <div
          key={index}
          className="absolute z-[1] overflow-hidden bg-[linear-gradient(145deg,rgba(23,23,17,0.1),rgba(23,23,17,0.32))]"
          style={{
            left: `${(slot.x / TEMPLATE_WIDTH) * 100}%`,
            top: `${(slot.y / TEMPLATE_HEIGHT) * 100}%`,
            width: `${(slot.width / TEMPLATE_WIDTH) * 100}%`,
            height: `${(slot.height / TEMPLATE_HEIGHT) * 100}%`,
            borderRadius: `${((slot.borderRadius ?? 0) / slot.width) * 100}% / ${((slot.borderRadius ?? 0) / slot.height) * 100}%`,
            transform: `rotate(${slot.rotation ?? 0}deg)`,
          }}
        >
          {photos[index] && <img src={photos[index]} alt="" className="h-full w-full object-cover" />}
        </div>
      ))}
      {overlayUrl && <img src={overlayUrl} alt="" className="absolute inset-0 z-[2] h-full w-full object-fill" />}
      <div className="absolute inset-0 z-0">
        <TemplateDecoration frame={frame} />
      </div>
    </div>
  )
}
