import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraCapture } from '../../camera/presentation/camera-capture'
import { composePhotoStrip } from '../../camera/application/compose-photo-strip'
import { composePhotoSheet } from '../../camera/application/compose-photo-sheet'
import { composePrintPdf } from '../../camera/application/compose-print-pdf'
import { composeLiveTemplate } from '../../camera/application/compose-live-template'
import {
  defaultPhotoTransforms,
  resolveFrameSlots,
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
import type { ShareService, SharedResult } from '../../sharing/application/share-service'
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

function readThemeColor(variable: string, fallback: string) {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return value || fallback
}
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
  const [photoSheet, setPhotoSheet] = useState<Blob>()
  const resultUrl = useObjectUrl(photoSheet)
  const [actionError, setActionError] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [sharing, setSharing] = useState(false)
  const [destroying, setDestroying] = useState(false)
  const [sharedResult, setSharedResult] = useState<SharedResult>()
  const shareInFlightRef = useRef(false)
  const [preparingPrint, setPreparingPrint] = useState(false)

  const print = async () => {
    if (!photoSheet || preparingPrint) return
    const previewWindow = window.open('', '_blank')
    setPreparingPrint(true)
    try {
      const pdf = await composePrintPdf(photoSheet)
      const pdfUrl = URL.createObjectURL(pdf)
      if (previewWindow) {
        previewWindow.location.replace(pdfUrl)
      } else {
        const link = document.createElement('a')
        link.href = pdfUrl
        link.download = `tobfest-4r-${sessionId.slice(0, 8)}.pdf`
        link.target = '_blank'
        link.click()
      }
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 5 * 60 * 1_000)
      setActionError('')
    } catch {
      previewWindow?.close()
      setActionError('PDF 4R gagal dibuat.')
    } finally {
      setPreparingPrint(false)
    }
  }

  useEffect(() => {
    let active = true
    void composePhotoSheet(result)
      .then((sheet) => {
        if (active) setPhotoSheet(sheet)
      })
      .catch(() => {
        if (active) setActionError('Hasil gagal dibuat.')
      })
    return () => {
      active = false
    }
  }, [result])

  const createQr = useCallback(async () => {
    if (!liveResult || !photoSheet || shareInFlightRef.current || sharedResult) return
    shareInFlightRef.current = true
    setSharing(true)
    try {
      const shared = await shareService.publish(sessionId, { photo: photoSheet, live: liveResult })
      const image = await QRCode.toDataURL(shared.downloadUrl, {
        width: 420,
        margin: 2,
        color: {
          dark: readThemeColor('--theme-ink', '#171711'),
          light: readThemeColor('--theme-paper', '#fffaf0'),
        },
        errorCorrectionLevel: 'M',
      })
      setSharedResult(shared)
      setQrImage(image)
      setActionError('')
    } catch {
      setActionError('QR gagal dibuat.')
    } finally {
      shareInFlightRef.current = false
      setSharing(false)
    }
  }, [liveResult, photoSheet, sessionId, shareService, sharedResult])

  useEffect(() => {
    const timer = window.setTimeout(() => void createQr(), 0)
    return () => window.clearTimeout(timer)
  }, [createQr])

  const startAgain = async () => {
    if (destroying || sharing) return
    if (!sharedResult) {
      onDone()
      return
    }

    setDestroying(true)
    try {
      await shareService.destroy(sharedResult.id, sharedResult.destroyToken)
      onDone()
    } catch {
      setActionError('Hasil belum terhapus.')
      setDestroying(false)
    }
  }

  return (
    <main className="result-page">
      <div className="result-copy">
        <h1>Selesai.</h1>
        <div className="result-buttons">
          <button className="secondary-button" type="button" onClick={() => void print()} disabled={!photoSheet || preparingPrint}>{preparingPrint ? '…' : '▣ Cetak 4R'}</button>
        </div>
        {sharing && <span className="qr-loading" aria-live="polite">•••</span>}
        {qrImage && <img className="download-qr" src={qrImage} alt="QR unduh foto dan Live Photo" />}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {actionError && !qrImage && <button className="secondary-button" type="button" onClick={() => void createQr()}>Coba lagi</button>}
        <button className="text-button" type="button" onClick={() => void startAgain()} disabled={destroying || sharing}>{destroying ? '…' : 'Mulai lagi →'}</button>
      </div>
      <div className="result-visual">
        <div className="final-photo-wrap">{resultUrl && <img src={resultUrl} alt="Hasil akhir photobooth" />}</div>
      </div>
    </main>
  )
}

export function BoothApp({ container }: BoothAppProps) {
  const [screen, setScreen] = useState<BoothScreen>('idle')
  const [frames, setFrames] = useState<PhotoFrame[]>([])
  const [session, setSession] = useState<BoothSession>()
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [cameraSlots, setCameraSlots] = useState<number[]>([])
  const [photoTransforms, setPhotoTransforms] = useState<PhotoTransform[]>(
    () => defaultPhotoTransforms.map((transform) => ({ ...transform })),
  )
  const [fatalError, setFatalError] = useState('')

  const selectedFrame = useMemo(() => {
    return frames.find((item) => item.id === selectedFrameId) ?? frames[0]
  }, [frames, selectedFrameId])
  const requiredPhotoCount = selectedFrame
    ? resolveFrameSlots(selectedFrame).length
    : 0
  const allCameraSlots = useMemo(
    () => Array.from({ length: requiredPhotoCount }, (_, index) => index),
    [requiredPhotoCount],
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
      const selectingSession: BoothSession = { ...nextSession, status: 'selecting-frame' }
      await container.sessionService.save(selectingSession)
      setSession(selectingSession)
      setCameraSlots([])
      setPhotoTransforms(defaultPhotoTransforms.map((transform) => ({ ...transform })))
      setScreen('frames')
    } catch (reason) {
      setFatalError(reason instanceof Error ? reason.message : 'Sesi tidak dapat dimulai.')
    }
  }

  const chooseFrame = (frame: PhotoFrame) => {
    setSelectedFrameId(frame.id)
    const slotCount = resolveFrameSlots(frame).length
    setPhotoTransforms(Array.from({ length: slotCount }, (_, index) => ({
      ...(defaultPhotoTransforms[index] ?? defaultPhotoTransforms[0]),
    })))
    persistSession((current) => ({ ...current, frameId: frame.id }))
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

  const beginCapture = async () => {
    if (!session || !selectedFrame || allCameraSlots.length === 0) return
    const capturingSession: BoothSession = {
      ...session,
      frameId: selectedFrame.id,
      photos: [],
      livePhotos: [],
      status: 'capturing',
    }
    await container.sessionService.save(capturingSession)
    setSession(capturingSession)
    setCameraSlots(allCameraSlots)
    setPhotoTransforms(Array.from({ length: allCameraSlots.length }, (_, index) => ({
      ...(defaultPhotoTransforms[index] ?? defaultPhotoTransforms[0]),
    })))
    setScreen('camera')
  }

  const finishCapture = () => {
    persistSession((current) => ({ ...current, status: 'reviewing' }))
    setScreen('review')
  }

  const retake = (slot: number) => {
    setCameraSlots([slot])
    setPhotoTransforms((current) => current.map((transform, index) => (
      index === slot
        ? { ...(defaultPhotoTransforms[slot] ?? defaultPhotoTransforms[0]) }
        : transform
    )))
    setScreen('camera')
  }

  const changePhotoTransform = (slot: number, transform: PhotoTransform) => {
    setPhotoTransforms((current) => current.map((item, index) => (
      index === slot ? transform : item
    )))
  }

  const finalize = async () => {
    const photosComplete = session && Array.from(
      { length: requiredPhotoCount },
      (_, index) => Boolean(session.photos[index]),
    ).every(Boolean)
    if (!session || !selectedFrame || !photosComplete) return
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
    setCameraSlots([])
    setPhotoTransforms(defaultPhotoTransforms.map((transform) => ({ ...transform })))
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
        mode="select"
        frames={frames}
        photos={[]}
        livePhotos={[]}
        transforms={photoTransforms}
        selectedId={selectedFrameId}
        onSelect={chooseFrame}
        onTransformChange={changePhotoTransform}
        onRetake={retake}
        onContinue={() => void beginCapture()}
        onBack={reset}
      />
    )
  }

  if (screen === 'review' && selectedFrame) {
    return (
      <FramePicker
        mode="edit"
        frames={[selectedFrame]}
        photos={session?.photos ?? []}
        livePhotos={session?.livePhotos ?? []}
        transforms={photoTransforms}
        selectedId={selectedFrame.id}
        onSelect={() => undefined}
        onTransformChange={changePhotoTransform}
        onRetake={retake}
        onContinue={() => void finalize()}
        onBack={() => {
          setCameraSlots(allCameraSlots)
          setScreen('camera')
        }}
      />
    )
  }

  if (screen === 'camera') {
    return (
      <CameraCapture
        slots={cameraSlots}
        totalSlots={requiredPhotoCount}
        photos={session?.photos ?? []}
        startInReview={cameraSlots.length > 1 && session?.photos.length === requiredPhotoCount}
        onCapture={capturePhoto}
        onComplete={finishCapture}
        onCancel={() => {
          if (cameraSlots.length === 1) {
            setScreen('review')
          } else if (session?.photos.length === requiredPhotoCount) {
            setScreen('review')
          } else {
            setScreen('frames')
          }
        }}
      />
    )
  }

  if (screen === 'processing') return <ProcessingPage />

  if (screen === 'result' && session?.finalImage) {
    return <ResultPage result={session.finalImage} liveResult={session.finalLive} sessionId={session.id} shareService={container.shareService} onDone={reset} />
  }

  return <LandingPage onStart={() => void startSession()} onOperator={() => void openOperator()} />
}
