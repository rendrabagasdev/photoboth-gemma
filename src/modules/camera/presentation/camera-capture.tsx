import { useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import { captureLivePhoto, type LivePhotoCapture } from '../application/capture-live-photo'

type CameraCaptureProps = {
  slots: number[]
  totalSlots: number
  photos: string[]
  startInReview?: boolean
  onCapture: (slot: number, capture: LivePhotoCapture) => void
  onComplete: () => void
  onCancel: () => void
}

type CameraState = 'requesting' | 'ready' | 'countdown' | 'live' | 'flash' | 'error'
type TimerSeconds = 3 | 5 | 10
type CameraFilter = 'normal' | 'warm' | 'mono'
type LensMode = 'normal' | 'wide'
type CameraAspect = '4:5' | '1:1' | '5:4'

const cameraAspectOptions: Record<CameraAspect, { width: number; height: number; ratio: number }> = {
  '4:5': { width: 1200, height: 1500, ratio: 4 / 5 },
  '1:1': { width: 1200, height: 1200, ratio: 1 },
  '5:4': { width: 1500, height: 1200, ratio: 5 / 4 },
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function CameraCapture({
  slots,
  totalSlots,
  photos,
  startInReview = false,
  onCapture,
  onComplete,
  onCancel,
}: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const activeRef = useRef(true)
  const [cameraState, setCameraState] = useState<CameraState>('requesting')
  const [countdown, setCountdown] = useState(3)
  const [activeSlot, setActiveSlot] = useState(slots[0] ?? 0)
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(3)
  const [showGrid, setShowGrid] = useState(false)
  const [cameraFilter, setCameraFilter] = useState<CameraFilter>('normal')
  const [bright, setBright] = useState(false)
  const [lensMode, setLensMode] = useState<LensMode>('normal')
  const [cameraAspect, setCameraAspect] = useState<CameraAspect>('4:5')
  const [slotCursor, setSlotCursor] = useState(0)
  const [acceptedPhotos, setAcceptedPhotos] = useState<string[]>(photos)
  const [captureComplete, setCaptureComplete] = useState(startInReview)
  const [selectedPhotoSlot, setSelectedPhotoSlot] = useState<number>()

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  const captureStill = () => {
    const video = webcamRef.current?.video
    if (!video?.videoWidth || !video.videoHeight) return null

    const { width: outputWidth, height: outputHeight } = cameraAspectOptions[cameraAspect]
    const sourceAspect = video.videoWidth / video.videoHeight
    const targetAspect = outputWidth / outputHeight
    let sourceWidth = video.videoWidth
    let sourceHeight = video.videoHeight

    if (sourceAspect > targetAspect) sourceWidth = video.videoHeight * targetAspect
    else sourceHeight = video.videoWidth / targetAspect

    const zoom = lensMode === 'normal' ? 1.14 : 1
    sourceWidth /= zoom
    sourceHeight /= zoom
    const sourceX = (video.videoWidth - sourceWidth) / 2
    const sourceY = (video.videoHeight - sourceHeight) / 2
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return null

    const filters = cameraFilter === 'warm'
      ? ['sepia(0.2)', 'saturate(1.22)', 'contrast(1.04)']
      : cameraFilter === 'mono'
        ? ['grayscale(1)', 'contrast(1.08)']
        : []
    filters.push(`brightness(${bright ? 1.2 : 1})`)
    context.filter = filters.join(' ')
    context.translate(outputWidth, 0)
    context.scale(-1, 1)
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    )
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  const runCapture = async (options?: {
    slot?: number
    cursor?: number
    stopAfterCapture?: boolean
    previewAfterCapture?: boolean
  }) => {
    if (cameraState !== 'ready') return

    let currentCursor = options?.cursor ?? slotCursor
    let currentSlot = options?.slot ?? activeSlot

    while (activeRef.current) {
      setCameraState('countdown')

      let remaining = timerSeconds
      setCountdown(remaining)
      while (remaining > 2) {
        await wait(1_000)
        if (!activeRef.current) return
        remaining -= 1
        setCountdown(remaining)
      }

      const capturePromise = captureLivePhoto(
        streamRef.current,
        () => activeRef.current ? captureStill() : null,
        () => {
          if (!activeRef.current) return
          setCameraState('flash')
          window.setTimeout(() => {
            if (activeRef.current) setCameraState('live')
          }, 450)
        },
      ).catch(() => undefined)

      await wait(750)
      if (!activeRef.current) return
      setCountdown(1)

      const capture = await capturePromise
      if (!capture) {
        setCameraState('error')
        return
      }

      const capturedSlot = currentSlot
      onCapture(capturedSlot, capture)
      setAcceptedPhotos((current) => {
        const next = [...current]
        next[capturedSlot] = capture.photo
        return next
      })

      const isLastSlot = currentCursor >= slots.length - 1
      if (options?.stopAfterCapture || isLastSlot) {
        setCaptureComplete(true)
        if (options?.previewAfterCapture) setSelectedPhotoSlot(capturedSlot)
        setCameraState('ready')
        return
      }

      currentCursor += 1
      currentSlot = slots[currentCursor] ?? currentSlot
      setSlotCursor(currentCursor)
      setActiveSlot(currentSlot)
      await wait(350)
    }
  }

  const cycleFilter = () => {
    setCameraFilter((current) => current === 'normal' ? 'warm' : current === 'warm' ? 'mono' : 'normal')
  }

  const selectAccepted = (slot: number) => {
    setActiveSlot(slot)
    setSelectedPhotoSlot(slot)
  }

  const selectCameraAspect = (aspect: CameraAspect) => {
    if (aspect === cameraAspect) return
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = undefined
    setCameraState('requesting')
    setCameraAspect(aspect)
  }

  const retakeSelected = () => {
    if (selectedPhotoSlot === undefined) return
    const slot = selectedPhotoSlot
    setSelectedPhotoSlot(undefined)
    setActiveSlot(slot)
    setCaptureComplete(false)
    void runCapture({ slot, cursor: 0, stopAfterCapture: true, previewAfterCapture: true })
  }

  const controlsDisabled = cameraState !== 'ready' || captureComplete

  return (
    <section className="camera-screen" aria-label="Ambil foto">
      <header className="camera-topbar">
        <button className="camera-back" type="button" onClick={onCancel} aria-label="Kembali">
          ←
        </button>
        <div className="camera-timers" aria-label="Pilih timer">
          {([3, 5, 10] as TimerSeconds[]).map((seconds) => (
            <button
              className={timerSeconds === seconds ? 'active' : ''}
              type="button"
              key={seconds}
              onClick={() => setTimerSeconds(seconds)}
              disabled={controlsDisabled}
            >
              <span aria-hidden="true">◷</span> {seconds}s
            </button>
          ))}
        </div>
        <div className="camera-view-controls">
          <div className="camera-aspects" aria-label="Pilih rasio kamera">
            {(Object.keys(cameraAspectOptions) as CameraAspect[]).map((aspect) => (
              <button
                className={cameraAspect === aspect ? 'active' : ''}
                type="button"
                key={aspect}
                onClick={() => selectCameraAspect(aspect)}
                disabled={controlsDisabled}
              >
                {aspect}
              </button>
            ))}
          </div>
          <div className="camera-lenses" aria-label="Pilih lensa">
            {(['normal', 'wide'] as LensMode[]).map((mode) => (
              <button
                className={lensMode === mode ? 'active' : ''}
                type="button"
                key={mode}
                onClick={() => setLensMode(mode)}
                disabled={controlsDisabled}
              >
                {mode === 'normal' ? 'Normal' : 'Wide'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="camera-workspace">
        <aside className="camera-tools" aria-label="Pengaturan kamera">
          <button className={showGrid ? 'active' : ''} type="button" onClick={() => setShowGrid((current) => !current)} disabled={controlsDisabled}>
            <span aria-hidden="true">▦</span><strong>Kisi</strong>
          </button>
          <button className={cameraFilter !== 'normal' ? 'active' : ''} type="button" onClick={cycleFilter} disabled={controlsDisabled}>
            <span aria-hidden="true">◉</span><strong>Filter</strong>
          </button>
          <button className={bright ? 'active' : ''} type="button" onClick={() => setBright((current) => !current)} disabled={controlsDisabled}>
            <span aria-hidden="true">☀</span><strong>Bersinar</strong>
          </button>
        </aside>

        <div className="camera-main">
          <div className={`camera-stage camera-aspect-${cameraAspect.replace(':', '-')}`}>
            <Webcam
              key={cameraAspect}
              ref={webcamRef}
              audio={false}
              className={`webcam camera-lens-${lensMode} camera-filter-${cameraFilter} ${bright ? 'camera-light-on' : ''}`}
              mirrored
              screenshotFormat="image/jpeg"
              screenshotQuality={0.92}
              videoConstraints={{
                facingMode: 'user',
                width: cameraAspectOptions[cameraAspect].width,
                height: cameraAspectOptions[cameraAspect].height,
                aspectRatio: cameraAspectOptions[cameraAspect].ratio,
              }}
              onUserMedia={(stream) => {
                streamRef.current = stream
                setCameraState('ready')
              }}
              onUserMediaError={() => setCameraState('error')}
            />

            <div className="capture-progress">
              <strong>Foto {activeSlot + 1} / {totalSlots}</strong>
            </div>
            {showGrid && selectedPhotoSlot === undefined && <div className="camera-grid" aria-hidden="true" />}

            {selectedPhotoSlot !== undefined && acceptedPhotos[selectedPhotoSlot] && (
              <img
                className="camera-selected-photo"
                src={acceptedPhotos[selectedPhotoSlot]}
                alt={`Preview foto ${selectedPhotoSlot + 1}`}
              />
            )}

            {cameraState === 'requesting' && (
              <div className="camera-overlay compact">
                <span className="spinner" />
                <strong>Menyiapkan kamera…</strong>
              </div>
            )}

            {cameraState === 'countdown' && (
              <div className="camera-overlay countdown" aria-live="assertive">
                <span>{countdown}</span>
              </div>
            )}

            {cameraState === 'flash' && <div className="camera-flash" />}

            {cameraState === 'error' && (
              <div className="camera-overlay error-card">
                <span className="large-icon">!</span>
                <strong>Kamera belum dapat digunakan</strong>
                <p>Izinkan akses kamera, lalu muat ulang aplikasi.</p>
              </div>
            )}
          </div>

          {selectedPhotoSlot !== undefined ? (
            <div className="camera-photo-actions">
              <button className="camera-retake-action" type="button" onClick={retakeSelected}>Retake</button>
              <button className="shutter-button" type="button" onClick={onComplete}>Lanjut</button>
            </div>
          ) : captureComplete ? (
            <button className="shutter-button" type="button" onClick={onComplete}>Lanjut</button>
          ) : (
            <button
              className="shutter-button"
              type="button"
              onClick={() => void runCapture()}
              disabled={cameraState !== 'ready'}
            >
              <span aria-hidden="true">▣</span> Mulai Foto
            </button>
          )}
        </div>

        <aside className="camera-results" aria-label="Hasil foto">
          {Array.from({ length: totalSlots }, (_, slot) => (
            <button
              className={`${acceptedPhotos[slot] ? 'filled' : ''} ${selectedPhotoSlot === slot ? 'active' : ''}`}
              type="button"
              key={slot}
              onClick={() => acceptedPhotos[slot] && selectAccepted(slot)}
              disabled={!acceptedPhotos[slot] || cameraState !== 'ready'}
              style={{ aspectRatio: `${cameraAspectOptions[cameraAspect].width} / ${cameraAspectOptions[cameraAspect].height}` }}
              aria-label={acceptedPhotos[slot] ? `Tinjau foto ${slot + 1}` : `Foto ${slot + 1} belum diambil`}
            >
              {acceptedPhotos[slot] && <img src={acceptedPhotos[slot]} alt={`Foto ${slot + 1}`} />}
              <span>{slot + 1}</span>
            </button>
          ))}
        </aside>
      </div>
    </section>
  )
}
