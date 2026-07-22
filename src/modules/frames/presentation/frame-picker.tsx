import type { PhotoFrame } from '../domain/photo-frame'
import { framePalettes, type FramePalette } from '../domain/frame-palette'
import { FramePreview } from './frame-preview'
import { PhotoTemplateEditor } from '../../camera/presentation/photo-template-editor'
import type { PhotoTransform } from '../../camera/domain/template-layout'
import type { LivePhotoClip } from '../../sessions/domain/booth-session'

type FramePickerProps = {
  frames: PhotoFrame[]
  photos: string[]
  livePhotos: Array<LivePhotoClip | undefined>
  transforms: PhotoTransform[]
  selectedId: string | null
  paletteId: string
  onSelect: (frame: PhotoFrame) => void
  onPaletteSelect: (palette: FramePalette) => void
  onTransformChange: (slot: number, transform: PhotoTransform) => void
  onRetake: (slot: number) => void
  onContinue: () => void
  onBack: () => void
}

export function FramePicker({
  frames,
  photos,
  livePhotos,
  transforms,
  selectedId,
  paletteId,
  onSelect,
  onPaletteSelect,
  onTransformChange,
  onRetake,
  onContinue,
  onBack,
}: FramePickerProps) {
  const palette = framePalettes.find((item) => item.id === paletteId) ?? framePalettes[0]
  const selectedFrame = frames.find((frame) => frame.id === selectedId) ?? frames[0]
  const applyPalette = (frame: PhotoFrame): PhotoFrame => ({
    ...frame,
    accent: palette.accent,
    accentSoft: palette.soft,
  })

  return (
    <main className="flow-page frame-picker-page">
      <header className="flow-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Kembali">
          ←
        </button>
        <span />
        <span className="step-count">02 / 02</span>
      </header>

      <section className="frame-picker-pattern">
        <div className="frame-large-preview" aria-label="Atur foto dan preview frame">
          {selectedFrame && (
            <PhotoTemplateEditor
              photos={photos}
              livePhotos={livePhotos}
              frame={applyPalette(selectedFrame)}
              transforms={transforms}
              onTransformChange={onTransformChange}
              onRetake={onRetake}
            />
          )}
        </div>

        <div className="frame-picker-panel">
          <section className="palette-section" aria-labelledby="palette-title">
            <h1 id="palette-title">Color Palette</h1>
            <div className="palette-grid">
              {framePalettes.map((item) => (
                <button
                  key={item.id}
                  className={`palette-swatch ${palette.id === item.id ? 'selected' : ''}`}
                  type="button"
                  style={{ '--swatch': item.accent } as React.CSSProperties}
                  onClick={() => onPaletteSelect(item)}
                  aria-label={item.name}
                  aria-pressed={palette.id === item.id}
                />
              ))}
            </div>
          </section>

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
                    <FramePreview frame={applyPalette(frame)} compact photos={photos} />
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </section>

      <footer className="sticky-action-bar frame-picker-actions">
        <button
          className="primary-button frame-continue-button"
          type="button"
          onClick={onContinue}
          disabled={!selectedId}
          aria-label="Lanjut"
        >
          →
        </button>
      </footer>
    </main>
  )
}
