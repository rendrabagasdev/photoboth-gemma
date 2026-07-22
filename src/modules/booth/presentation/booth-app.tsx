import { useEffect, useMemo, useState } from 'react'
import { CameraCapture } from '../../camera/presentation/camera-capture'
import { composePhotoStrip } from '../../camera/application/compose-photo-strip'
import { composeLiveTemplate } from '../../camera/application/compose-live-template'
import { PhotoTemplateEditor } from '../../camera/presentation/photo-template-editor'
import {
  defaultPhotoTransforms,
  type PhotoTransform,
} from '../../camera/domain/template-layout'
import type { FrameService } from '../../frames/application/frame-service'
import type { PhotoFrame } from '../../frames/domain/photo-frame'
import { FramePicker } from '../../frames/presentation/frame-picker'
import type { SessionService } from '../../sessions/application/session-service'
import type { BoothSession } from '../../sessions/domain/booth-session'
import type { LivePhotoCapture } from '../../camera/application/capture-live-photo'
import { useObjectUrl } from '../../../shared/presentation/use-object-url'
import { OperatorLock } from '../../operator/presentation/operator-lock'
import { OperatorDashboard } from '../../operator/presentation/operator-dashboard'
import type { UnlockApp } from '../../app-lock/application/use-cases/unlock-app'
import type { TokenServices } from '../../app-lock/application/ports/token-services'
import type { ShareService } from '../../sharing/application/share-service'
import QRCode from 'qrcode'

type BoothScreen =
  | 'idle'
  | 'frames'
  | 'camera'
  | 'review'
  | 'processing'
  | 'result'
  | 'operator-lock'
  | 'operator'

type BoothAppProps = {
  container: {
    frameService: FrameService
    sessionService: SessionService
    unlockApp: UnlockApp
    tokenService: TokenServices
    shareService: ShareService
  }
}

const TOTAL_PHOTOS = 3
const OPERATOR_TOKEN_KEY = 'tobfest-operator-token'

function LandingPage({ onStart, onOperator }: { onStart: () => void; onOperator: () => void }) {
  return (
    <main className="landing-page">
      <button
        className="icon-button operator-entry"
        type="button"
        onClick={onOperator}
        aria-label="Buka dashboard operator"
      >
        ⚙
      </button>
      <button className="public-start-button" type="button" onClick={onStart}>
        <span aria-hidden="true">●</span>
        Mulai Foto
      </button>
    </main>
  )
}

function ReviewPage({
  photos,
  livePhotos,
  frame,
  onRetake,
  onChangeFrame,
  transforms,
  onTransformChange,
  onFinish,
}: {
  photos: string[]
  livePhotos: BoothSession['livePhotos']
  frame: PhotoFrame
  onRetake: (slot: number) => void
  onChangeFrame: () => void
  transforms: PhotoTransform[]
  onTransformChange: (slot: number, transform: PhotoTransform) => void
  onFinish: () => void
}) {
  return (
    <main className="flow-page review-page">
      <header className="flow-header">
        <button className="icon-button" type="button" onClick={onChangeFrame} aria-label="Ganti frame">←</button>
        <span />
        <span className="step-count">03 / 03</span>
      </header>

      <section className="review-layout">
        <div className="review-copy">
          <div className="selected-frame-chip" style={{ '--chip-color': frame.accent } as React.CSSProperties}>
            <span /> <p><strong>{frame.name}</strong></p>
            <button type="button" onClick={onChangeFrame}>Ganti</button>
          </div>
        </div>

        <PhotoTemplateEditor
          photos={photos}
          livePhotos={livePhotos}
          frame={frame}
          transforms={transforms}
          onTransformChange={onTransformChange}
          onRetake={onRetake}
        />
      </section>

      <footer className="sticky-action-bar review-actions">
        <span />
        <button className="primary-button" type="button" onClick={onFinish}>Lanjut <span>→</span></button>
      </footer>
    </main>
  )
}

function ProcessingPage() {
  return (
    <main className="processing-page">
      <div className="processing-art"><span /><span /><span /><strong>✦</strong></div>
      <h1>Memproses…</h1>
      <div className="processing-line"><i /></div>
    </main>
  )
}

function ResultPage({
  result,
  liveResult,
  sessionId,
  shareService,
  onDone,
}: {
  result: Blob
  liveResult?: Blob
  sessionId: string
  shareService: ShareService
  onDone: () => void
}) {
  const resultUrl = useObjectUrl(result)
  const [actionError, setActionError] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [sharing, setSharing] = useState(false)

  const createQr = async () => {
    if (!liveResult || sharing) return
    setSharing(true)
    try {
      const shared = await shareService.publish(sessionId, { photo: result, live: liveResult })
      setQrImage(await QRCode.toDataURL(shared.downloadUrl, {
        width: 420,
        margin: 2,
        color: { dark: '#171711', light: '#fffaf0' },
        errorCorrectionLevel: 'M',
      }))
      setActionError('')
    } catch {
      setActionError('QR gagal dibuat.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <main className="result-page">
      <div className="result-copy">
        <h1>Selesai.</h1>
        <div className="result-buttons">
          {!qrImage && <button className="primary-button" type="button" onClick={() => void createQr()} disabled={!liveResult || sharing}>{sharing ? '…' : 'QR'}</button>}
        </div>
        {qrImage && <img className="download-qr" src={qrImage} alt="QR unduh foto dan Live Photo" />}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        <button className="text-button" type="button" onClick={onDone}>Mulai lagi →</button>
      </div>
      <div className="result-visual">
        <span className="result-star one">✦</span><span className="result-star two">★</span>
        <div className="final-photo-wrap">{resultUrl && <img src={resultUrl} alt="Hasil akhir photobooth" />}</div>
        <div className="success-sticker">✓</div>
      </div>
    </main>
  )
}

export function BoothApp({ container }: BoothAppProps) {
  const [screen, setScreen] = useState<BoothScreen>('idle')
  const [frames, setFrames] = useState<PhotoFrame[]>([])
  const [session, setSession] = useState<BoothSession>()
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [cameraSlots, setCameraSlots] = useState<number[]>([0, 1, 2])
  const [photoTransforms, setPhotoTransforms] = useState<PhotoTransform[]>(
    () => defaultPhotoTransforms.map((transform) => ({ ...transform })),
  )
  const [framePickerOrigin, setFramePickerOrigin] = useState<'capture' | 'review'>('capture')
  const [fatalError, setFatalError] = useState('')

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? frames[0],
    [frames, selectedFrameId],
  )

  const loadFrames = async () => {
    await container.frameService.initialize()
    const activeFrames = await container.frameService.listActive()
    setFrames(activeFrames)
    const defaultFrame = activeFrames.find((frame) => frame.isDefault) ?? activeFrames[0]
    if (defaultFrame) setSelectedFrameId(defaultFrame.id)
  }

  useEffect(() => {
    let cancelled = false

    void container.frameService
      .initialize()
      .then(() => container.frameService.listActive())
      .then((activeFrames) => {
        if (cancelled) return
        setFrames(activeFrames)
        const defaultFrame = activeFrames.find((frame) => frame.isDefault) ?? activeFrames[0]
        if (defaultFrame) setSelectedFrameId(defaultFrame.id)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setFatalError(reason instanceof Error ? reason.message : 'Aplikasi gagal disiapkan.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [container])

  const persistSession = (updater: (current: BoothSession) => BoothSession) => {
    setSession((current) => {
      if (!current) return current
      const next = updater(current)
      void container.sessionService.save(next)
      return next
    })
  }

  const startSession = async () => {
    try {
      const nextSession = await container.sessionService.start()
      const capturingSession: BoothSession = { ...nextSession, status: 'capturing' }
      await container.sessionService.save(capturingSession)
      setSession(capturingSession)
      setCameraSlots([0, 1, 2])
      setPhotoTransforms(defaultPhotoTransforms.map((transform) => ({ ...transform })))
      setFramePickerOrigin('capture')
      setScreen('camera')
    } catch (reason) {
      setFatalError(reason instanceof Error ? reason.message : 'Sesi tidak dapat dimulai.')
    }
  }

  const chooseFrame = (frame: PhotoFrame) => {
    setSelectedFrameId(frame.id)
    persistSession((current) => ({ ...current, frameId: frame.id }))
  }

  const continueFromFrames = () => {
    if (!selectedFrame) return
    persistSession((current) => ({
      ...current,
      frameId: selectedFrame.id,
      status: 'reviewing',
    }))
    setScreen('review')
  }

  const capturePhoto = (slot: number, capture: LivePhotoCapture) => {
    persistSession((current) => {
      const photos = [...current.photos]
      const livePhotos = [...(current.livePhotos ?? [])]
      photos[slot] = capture.photo
      livePhotos[slot] = capture.livePhoto
      return { ...current, photos, livePhotos, status: 'capturing' }
    })
  }

  const finishCapture = () => {
    if (cameraSlots.length === 1) {
      persistSession((current) => ({ ...current, status: 'reviewing' }))
      setScreen('review')
      return
    }

    persistSession((current) => ({ ...current, status: 'selecting-frame' }))
    setFramePickerOrigin('capture')
    setScreen('frames')
  }

  const retake = (slot: number) => {
    setCameraSlots([slot])
    setPhotoTransforms((current) => current.map((transform, index) => (
      index === slot ? { ...defaultPhotoTransforms[slot] } : transform
    )))
    setScreen('camera')
  }

  const changePhotoTransform = (slot: number, transform: PhotoTransform) => {
    setPhotoTransforms((current) => current.map((item, index) => (
      index === slot ? transform : item
    )))
  }

  const changeFrame = () => {
    setFramePickerOrigin('review')
    setScreen('frames')
  }

  const finalize = async () => {
    if (!session || !selectedFrame || session.photos.length !== TOTAL_PHOTOS) return
    setScreen('processing')
    persistSession((current) => ({ ...current, status: 'processing' }))
    try {
      const [finalImage, finalLive] = await Promise.all([
        composePhotoStrip(session.photos, selectedFrame, photoTransforms),
        composeLiveTemplate(
          session.photos,
          session.livePhotos ?? [],
          selectedFrame,
          photoTransforms,
        ).catch(() => undefined),
      ])
      const completed: BoothSession = {
        ...session,
        frameId: selectedFrame.id,
        status: 'completed',
        finalImage,
        finalLive,
        completedAt: new Date().toISOString(),
      }
      await container.sessionService.save(completed)
      setSession(completed)
      window.setTimeout(() => setScreen('result'), 900)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Hasil foto gagal dibuat.'
      setFatalError(message)
      persistSession((current) => ({ ...current, status: 'failed' }))
      setScreen('review')
    }
  }

  const reset = () => {
    setSession(undefined)
    setCameraSlots([0, 1, 2])
    setPhotoTransforms(defaultPhotoTransforms.map((transform) => ({ ...transform })))
    setFramePickerOrigin('capture')
    setFatalError('')
    setScreen('idle')
  }

  const unlockOperator = async (pin: string) => {
    const token = await container.unlockApp.execute(pin)
    sessionStorage.setItem(OPERATOR_TOKEN_KEY, token)
    setScreen('operator')
  }

  const openOperator = async () => {
    const storedToken = sessionStorage.getItem(OPERATOR_TOKEN_KEY)
    const isValid = storedToken ? await container.tokenService.verify(storedToken) : false
    setScreen(isValid ? 'operator' : 'operator-lock')
  }

  const exitOperator = () => {
    sessionStorage.removeItem(OPERATOR_TOKEN_KEY)
    void loadFrames()
    setScreen('idle')
  }

  if (fatalError && screen === 'idle') {
    return (
      <main className="fatal-page">
        <span>!</span><h1>Aplikasi perlu diperiksa</h1><p>{fatalError}</p>
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>Muat ulang</button>
      </main>
    )
  }

  if (screen === 'operator-lock') {
    return <OperatorLock onUnlock={unlockOperator} onCancel={() => setScreen('idle')} />
  }

  if (screen === 'operator') {
    return (
      <OperatorDashboard
        frameService={container.frameService}
        sessionService={container.sessionService}
        onFramesChanged={setFrames}
        onExit={exitOperator}
      />
    )
  }

  if (screen === 'frames') {
    return (
      <FramePicker
        frames={frames}
        selectedId={selectedFrameId}
        onSelect={chooseFrame}
        onContinue={continueFromFrames}
        onBack={() => {
          if (framePickerOrigin === 'review') {
            setScreen('review')
            return
          }
          setCameraSlots([0, 1, 2])
          setScreen('camera')
        }}
      />
    )
  }

  if (screen === 'camera') {
    return (
      <CameraCapture
        slots={cameraSlots}
        totalSlots={TOTAL_PHOTOS}
        onCapture={capturePhoto}
        onComplete={finishCapture}
        onCancel={() => {
          if (cameraSlots.length === 1) {
            setScreen('review')
          } else if (session?.photos.length === TOTAL_PHOTOS) {
            setScreen('frames')
          } else {
            reset()
          }
        }}
      />
    )
  }

  if (screen === 'review' && session && selectedFrame) {
    return (
      <>
        {fatalError && <div className="floating-error">{fatalError}<button type="button" onClick={() => setFatalError('')}>×</button></div>}
        <ReviewPage
          photos={session.photos}
          livePhotos={session.livePhotos ?? []}
          frame={selectedFrame}
          onRetake={retake}
          onChangeFrame={changeFrame}
          transforms={photoTransforms}
          onTransformChange={changePhotoTransform}
          onFinish={() => void finalize()}
        />
      </>
    )
  }

  if (screen === 'processing') return <ProcessingPage />

  if (screen === 'result' && session?.finalImage) {
    return <ResultPage result={session.finalImage} liveResult={session.finalLive} sessionId={session.id} shareService={container.shareService} onDone={reset} />
  }

  return <LandingPage onStart={() => void startSession()} onOperator={() => void openOperator()} />
}
