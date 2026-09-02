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
  onBack: _onBack,
}: FramePickerProps) {
  const selectedFrame = frames.find((frame) => frame.id === selectedId) ?? frames[0]

  return (
    <main className="min-h-screen  px-4 py-5 sm:px-6">

      <section className="mx-auto mt-6 max-w-6xl">
        <div className="">
          <div className="">


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

          {mode === 'select' && (
            <aside className="flex flex-col gap-4 items-center">
              <div className="mb-4">
                <h2 className="mt-3 font-sns text-2xl uppercase leading-none  sm:text-3xl">
                  Slide and choose your frame first
                </h2>
              </div>

              <div className="" aria-label="Daftar frame">
                {frames.map((frame) => {
                  const selected = selectedId === frame.id

                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => onSelect(frame)}
                      aria-pressed={selected}
                      aria-label={frame.name}
                      className={`group relative overflow-hidden rounded-2xl border p-2 text-left transition ${selected
                        ? 'border-[#D7D6D6] bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                        }`}
                    >
                      <div className="relative">
                        <FramePreview frame={frame} compact photos={photos} />
                        <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-[#070403]/85 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#D7D6D6]">
                          {resolveFrameSlots(frame).length}×
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </aside>
          )}
        </div>
      </section >

      <footer className="mx-auto mt-6 flex max-w-6xl justify-end">
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedId || (mode === 'edit' && photos.length === 0)}
          aria-label="Lanjut"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D7D6D6] text-2xl font-bold text-[#070403] shadow-[0_14px_28px_rgba(215,214,214,0.28)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </footer>
    </main >
  )
}
