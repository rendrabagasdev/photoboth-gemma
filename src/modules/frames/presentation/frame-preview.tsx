import type { PhotoFrame } from '../domain/photo-frame'
import { useObjectUrl } from '../../../shared/presentation/use-object-url'

type FramePreviewProps = {
  frame: PhotoFrame
  selected?: boolean
  compact?: boolean
  photos?: string[]
}

export function FramePreview({ frame, selected = false, compact = false, photos = [] }: FramePreviewProps) {
  const overlayUrl = useObjectUrl(frame.imageBlob)

  return (
    <div
      className={`frame-artwork ${compact ? 'compact' : ''} ${selected ? 'selected' : ''}`}
      style={{ '--frame-accent': frame.accent, '--frame-soft': frame.accentSoft } as React.CSSProperties}
    >
      <div className="mini-photo one">{photos[0] && <img src={photos[0]} alt="" />}</div>
      <div className="mini-photo two">{photos[1] && <img src={photos[1]} alt="" />}</div>
      <div className="mini-photo three">{photos[2] && <img src={photos[2]} alt="" />}</div>
      <div className="mini-brand">TOBFEST</div>
      <span className="frame-dot" />
      {overlayUrl && <img src={overlayUrl} alt="" className="uploaded-overlay" />}
    </div>
  )
}
