import type { PhotoFrame } from '../domain/photo-frame'
import { useObjectUrl } from '../../../shared/presentation/use-object-url'

type FramePreviewProps = {
  frame: PhotoFrame
  selected?: boolean
  compact?: boolean
}

export function FramePreview({ frame, selected = false, compact = false }: FramePreviewProps) {
  const overlayUrl = useObjectUrl(frame.imageBlob)

  return (
    <div
      className={`frame-artwork ${compact ? 'compact' : ''} ${selected ? 'selected' : ''}`}
      style={{ '--frame-accent': frame.accent, '--frame-soft': frame.accentSoft } as React.CSSProperties}
    >
      <div className="mini-photo one" />
      <div className="mini-photo two" />
      <div className="mini-photo three" />
      <div className="mini-brand">TOBFEST</div>
      <span className="frame-dot" />
      {overlayUrl && <img src={overlayUrl} alt="" className="uploaded-overlay" />}
    </div>
  )
}
