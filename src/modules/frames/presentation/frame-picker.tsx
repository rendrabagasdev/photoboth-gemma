import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import type { PhotoFrame } from '../domain/photo-frame'
import { FramePreview } from './frame-preview'
import { PhotoTemplateEditor } from '../../camera/presentation/photo-template-editor'
import type { PhotoTransform } from '../../camera/domain/template-layout'
import type { LivePhotoClip } from '../../sessions/domain/booth-session'

type FramePickerProps = {
  mode: 'select' | 'edit'
  frames: PhotoFrame[]
  photos: string[]
  livePhotos: Array<LivePhotoClip | undefined>
  transforms: PhotoTransform[]
  photoAssignments?: number[]
  selectedId: string | null
  onSelect: (frame: PhotoFrame) => void
  onPhotoAssignmentChange?: (slot: number, photoIndex: number) => void
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
  photoAssignments,
  selectedId,
  onSelect,
  onPhotoAssignmentChange,
  onTransformChange,
  onRetake,
  onContinue,
  onBack: _onBack,
}: FramePickerProps) {
  const selectedFrame = frames.find((frame) => frame.id === selectedId) ?? frames[0]
  const frameRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    if (mode !== 'select' || !selectedId) return

    const selectedButton = frameRefs.current[selectedId]
    if (selectedButton) {
      selectedButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [mode, selectedId])

  return (
    <main className="min-h-screen px-10 py-20">
      <section className="mx-auto max-w-7xl">


        {mode === 'edit' && selectedFrame && (
          <div className="font-sns flex flex-col w-full justify-center items-center" >
            <h1 className="text-2xl tracking-[0.11em]" > LET'S CHOICE. IT FEELS SO NICE TO BE YOURS! </h1>

            <PhotoTemplateEditor
              photos={photos}
              livePhotos={livePhotos}
              frame={selectedFrame}
              transforms={transforms}
              photoAssignments={photoAssignments}
              onPhotoAssignmentChange={onPhotoAssignmentChange}
              onTransformChange={onTransformChange}
              onRetake={onRetake}
            />

            <div className="flex w-full justify-center gap-4">
              <button type="button" onClick={onContinue} className="mt-8 w-40 transition-all hover:scale-110 active:scale-110">
                <img src="button_print.svg" alt="PRINT" />
              </button>
            </div>

          </div>
        )}

        {mode === 'select' && (
          <div className=" text-center">
            <h2 className="font-sns text-3xl uppercase tracking-[0.11em]">
              Slide and choose your frame first
            </h2>
          </div>
        )}

        {mode === 'select' && (
          <div className="overflow-x-auto flex-col overflow-hidden [-ms-overflow-style:none] scrollbar-width:none [&::-webkit-scrollbar]:hidden pt-10">
            <motion.div layout className="flex min-w-max items-end justify-start gap-7">
              {frames.map((frame) => {
                const selected = selectedId === frame.id

                return (
                  <motion.button
                    ref={(element) => {
                      frameRefs.current[frame.id] = element
                    }}
                    key={frame.id}
                    type="button"
                    layout
                    onClick={() => onSelect(frame)}
                    aria-pressed={selected}
                    aria-label={frame.name}
                    whileHover={{ y: -4, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20, mass: 0.8 }}
                    animate={{
                      scale: selected ? 1.05 : 1,
                      opacity: selected ? 1 : 0.9,
                      x: selected ? 0 : 0,
                    }}
                    className="group relative shrink-0 overflow-hidden border-0 bg-transparent p-0"
                  >
                    <div className="w-56">
                      <FramePreview frame={frame} compact photos={photos} />
                    </div>
                  </motion.button>
                )
              })}
            </motion.div>
          </div>
        )}
        {mode === 'select' && (
          <div className=" fixed bottom-20 left-0 w-full flex justify-center">
            <button type="button" onClick={onContinue} className='w-40 active:scale-110 hover:scale-110 transition-all '>
              <img src="button_camera_on.svg" alt="Camera" />
            </button>
          </div>
        )}
      </section>
    </main >
  )
}
