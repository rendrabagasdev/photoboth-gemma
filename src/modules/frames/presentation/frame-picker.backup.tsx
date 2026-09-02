import type { PhotoFrame } from '../domain/photo-frame'
import { FramePreview } from './frame-preview'
import { PhotoTemplateEditor } from '../../camera/presentation/photo-template-editor'
import type { PhotoTransform } from '../../camera/domain/template-layout'
import type { LivePhotoClip } from '../../sessions/domain/booth-session'
import { resolveFrameSlots } from '../../camera/domain/template-layout'

type FramePickerProps = {
  mode: 'select' | 'edit'
  frames: PhotoFrame[]
  photos: string[]
  livePhotos: Array<LivePhotoClip | undefined>
  transforms: PhotoTransform[]
  selectedId: string | null
  onSelect: (frame: PhotoFrame) => void
  onTransformChange: (slot: number, transform: PhotoTransform) => void
  onRetake: (slot: number) => void
  onContinue: () => void
  onBack: () => void
}

export function FramePicker({
  mode,
  frames,
  photos,
  livePhotos,
  transforms,
  selectedId,
  onSelect,
  onTransformChange,
  onRetake,
  onContinue,
  onBack,
}: FramePickerProps) {
  const selectedFrame = frames.find((frame) => frame.id === selectedId) ?? frames[0]

  return (
    <main className="flow-page frame-picker-page">
      <header className="flow-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Kembali">
          ←
        </button>
        <span />
        <span className="step-count">{mode === 'select' ? '01 / 03' : '03 / 03'}</span>
      </header>

      <section className={`frame-picker-pattern ${mode === 'edit' ? 'review-only' : ''}`}>
        <div className="frame-large-preview" aria-label="Atur foto dan preview frame">
          {selectedFrame && mode === 'select' && (
            <FramePreview
              frame={selectedFrame}
              selected
            />
          )}
          {selectedFrame && mode === 'edit' && (
            <PhotoTemplateEditor
              photos={photos}
              livePhotos={livePhotos}
              frame={selectedFrame}
              transforms={transforms}
              onTransformChange={onTransformChange}
              onRetake={onRetake}
            />
          )}
        </div>

        {mode === 'select' && <div className="frame-picker-panel">
          <section className="template-section" aria-labelledby="template-title">
            <h2 id="template-title">Pilih Frame</h2>
            <div className="template-grid" aria-label="Daftar frame">
              {frames.map((frame) => {
                const selected = selectedId === frame.id
                return (
                  <button
                    key={frame.id}
                    type="button"
                    className={`template-option ${selected ? 'selected' : ''}`}
                    onClick={() => onSelect(frame)}
                    aria-pressed={selected}
                    aria-label={frame.name}
                  >
                    <FramePreview frame={frame} compact photos={photos} />
                    <span className="template-photo-count">{resolveFrameSlots(frame).length}×</span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>}
      </section>

      <footer className="sticky-action-bar frame-picker-actions">
        <button
          className="primary-button frame-continue-button"
          type="button"
          onClick={onContinue}
          disabled={!selectedId || (mode === 'edit' && photos.length === 0)}
          aria-label="Lanjut"
        >
          →
        </button>
      </footer>
    </main>
  )
}
