import { useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import { captureLivePhoto, type LivePhotoCapture } from '../application/capture-live-photo'

type CameraCaptureProps = {
  slots: number[]
  totalSlots: number
  onCapture: (slot: number, capture: LivePhotoCapture) => void
  onComplete: () => void
  onCancel: () => void
}

type CameraState = 'requesting' | 'ready' | 'countdown' | 'live' | 'flash' | 'error'

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export function CameraCapture({
  slots,
  totalSlots,
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

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  const runCapture = async () => {
    if (cameraState !== 'ready') return

    for (const slot of slots) {
      if (!activeRef.current) return
      setActiveSlot(slot)
      setCameraState('countdown')

      setCountdown(3)
      await wait(1_000)
      if (!activeRef.current) return

      setCountdown(2)
      const capturePromise = captureLivePhoto(
        streamRef.current,
        () => activeRef.current ? webcamRef.current?.getScreenshot() ?? null : null,
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

      onCapture(slot, capture)
      await wait(450)
    }

    if (activeRef.current) {
      onComplete()
    }
  }

  return (
    <section className="camera-screen" aria-label="Ambil foto">
      <div className="camera-toolbar">
        <button className="icon-button light" type="button" onClick={onCancel} aria-label="Kembali">
          ←
        </button>
        <div className="capture-progress">
          <span>SIAPKAN POSE</span>
          <strong>
            Foto {activeSlot + 1} dari {totalSlots}
          </strong>
        </div>

      </div>

      <div className="camera-stage">
        <Webcam
          ref={webcamRef}
          audio={false}
          className="webcam"
          mirrored
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
          forceScreenshotSourceSize
          videoConstraints={{ facingMode: 'user', width: 1600, height: 1200, aspectRatio: 4 / 3 }}
          onUserMedia={(stream) => {
            streamRef.current = stream
            setCameraState('ready')
          }}
          onUserMediaError={() => setCameraState('error')}
        />

        <div className="camera-guide" aria-hidden="true">
          <span className="corner top-left" />
          <span className="corner top-right" />
          <span className="corner bottom-left" />
          <span className="corner bottom-right" />
        </div>

        {cameraState === 'requesting' && (
          <div className="camera-overlay compact">
            <span className="spinner" />
            <strong>Menyiapkan kamera…</strong>
          </div>
        )}

        {cameraState === 'countdown' && (
          <div className="camera-overlay countdown" aria-live="assertive">
            <span>{countdown}</span>
            <strong>NGUYU BOS!</strong>
          </div>
        )}

        {cameraState === 'flash' && <div className="camera-flash" />}


        {cameraState === 'error' && (
          <div className="camera-overlay error-card">
            <span className="large-icon">!</span>
            <strong>Kamera belum dapat digunakan</strong>
            <p>Izinkan akses kamera di pengaturan Safari, lalu muat ulang aplikasi.</p>
          </div>
        )}
      </div>

      <div className="camera-actions">
        <button
          className="shutter-button"
          type="button"
          onClick={runCapture}
          disabled={cameraState !== 'ready'}
          aria-label="Mulai mengambil foto"
        >
          <span />
        </button>
      </div>
    </section>
  )
}
