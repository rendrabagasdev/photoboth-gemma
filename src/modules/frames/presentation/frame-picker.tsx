import type { PhotoFrame } from '../domain/photo-frame'
import { FramePreview } from './frame-preview'

type FramePickerProps = {
  frames: PhotoFrame[]
  selectedId: string | null
  onSelect: (frame: PhotoFrame) => void
  onContinue: () => void
  onBack: () => void
}

export function FramePicker({
  frames,
  selectedId,
  onSelect,
  onContinue,
  onBack,
}: FramePickerProps) {
  return (
    <main className="flow-page frame-picker-page">
      <header className="flow-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Kembali">
          ←
        </button>
        <span />
        <span className="step-count">02 / 03</span>
      </header>

      <section className="frame-grid" aria-label="Daftar frame">
        {frames.map((frame) => {
          const selected = selectedId === frame.id
          return (
            <button
              key={frame.id}
              type="button"
              className={`frame-option ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(frame)}
              aria-pressed={selected}
              aria-label={frame.name}
            >
              <FramePreview frame={frame} selected={selected} />
              <strong className="frame-short-name">{frame.name}</strong>
              <span className="select-mark">{selected ? '✓' : '○'}</span>
            </button>
          )
        })}
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
