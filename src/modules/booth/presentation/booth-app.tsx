import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraCapture } from '../../camera/presentation/camera-capture'
import { composePhotoStrip } from '../../camera/application/compose-photo-strip'
import { composePhotoSheet } from '../../camera/application/compose-photo-sheet'
import { composeLiveTemplate } from '../../camera/application/compose-live-template'
import {
  defaultPhotoTransforms,
  resolveConfiguredPhotoCount,
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
import { createUuid } from '../../../shared/crypto/random-uuid'

type BoothScreen =
  | 'idle'
  | 'frames'
  | 'camera'
  | 'review'
  | 'processing'
  | 'result'
  | 'operator-lock'
  | 'operator'

type PrintStatus = 'idle' | 'preparing' | 'sending' | 'queued' | 'failed'

type PrintErrorResponse = {
  error?: string
  message?: string
  requestStatus?: 'failed' | 'uncertain'
  previousStatus?: 'processing' | 'queued' | 'failed' | 'uncertain'
}

const printStatusLabel: Record<Exclude<PrintStatus, 'idle'>, string> = {
  preparing: 'Menyiapkan foto',
  sending: 'Mengirim ke printer',
  queued: 'Masuk antrean',
  failed: 'Gagal mencetak',
}

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
    <main className="flex flex-col justify-between items-center h-screen">
      <div className="flex flex-col justify-center items-center gap-5 mt-30">
        <img src="picto_text.svg" alt="Logo Picto" className="w-40" />
        <h2 className="text-4xl font-sns  uppercase tracking-widest"> Picture Box </h2>
      </div>
      <div className="flex justify-center items-center mb-30">
        <button type="button" onClick={onStart} className="w-40 hover:scale-105 active:scale-105 transition-all">
          <img src="button_start.svg" alt="Button Start" />
        </button>
      </div>
      <div className="flex justify-center items-center gap-8 mb-20">
        <img src="picto_text.svg" alt="Logo Picto" className="w-20" />
        <p className='uppercase [word-spacing:0.9em] font-sns' >In Association With </p>
        <button type="button" onClick={onOperator}>
          <img src="tobfest_text.svg" alt="Logo Tobfest" className="w-20" />
        </button>
      </div>
    </main>
  )
}

function ProcessingPage({ image }: { image?: Blob }) {
  const imageUrl = useObjectUrl(image)

  return (
    <main className="relative flex h-screen w-screen flex-col items-center gap-4 overflow-hidden bg-[url('/bg_print.png')] bg-cover bg-center bg-no-repeat">
      <img
        src="/bg_fragment.svg"
        alt=""
        className="absolute left-0 top-0 z-20 w-full origin-top scale-[1.124] object-cover"
      />
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Hasil foto sedang diproses"
          className="process_container absolute top-55 w-119"
        />
      )}
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
  const [shareSheet, setShareSheet] = useState<Blob>()
  const resultUrl = useObjectUrl(photoSheet)
  const [actionError, setActionError] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [sharing, setSharing] = useState(false)
  const [destroying, setDestroying] = useState(false)
  const [sharedResult, setSharedResult] = useState<SharedResult>()
  const shareInFlightRef = useRef(false)
  const printInFlightRef = useRef(false)
  const printRequestIdRef = useRef<string | undefined>(undefined)
  const photoSheetInFlightRef = useRef<Promise<Blob> | undefined>(undefined)
  const shareSheetInFlightRef = useRef<Promise<Blob> | undefined>(undefined)
  const [printStatus, setPrintStatus] = useState<PrintStatus>('idle')
  const [printError, setPrintError] = useState('')
  const isPrinting = printStatus === 'preparing' || printStatus === 'sending'

  // Lembar cetak memakai margin aman dan garis potong; lembar unduh tidak,
  // karena hasil dari QR tidak pernah dipotong secara fisik.
  const preparePhotoSheet = useCallback((): Promise<Blob> => {
    if (photoSheet) return Promise.resolve(photoSheet)
    photoSheetInFlightRef.current ??= composePhotoSheet(result, { variant: 'print' })
    return photoSheetInFlightRef.current
  }, [photoSheet, result])

  const prepareShareSheet = useCallback((): Promise<Blob> => {
    if (shareSheet) return Promise.resolve(shareSheet)
    shareSheetInFlightRef.current ??= composePhotoSheet(result, { variant: 'download' })
    return shareSheetInFlightRef.current
  }, [shareSheet, result])

  const print = async () => {
    if (printInFlightRef.current || printStatus === 'queued') return
    printInFlightRef.current = true
    setPrintError('')
    setPrintStatus('preparing')
    let requestSent = false
    let serverResponded = false
    try {
      const sheet = await preparePhotoSheet()
      setPrintStatus('sending')
      const requestId = printRequestIdRef.current ?? createUuid()
      printRequestIdRef.current = requestId
      requestSent = true
      const response = await fetch('/api/print', {
        method: 'POST',
        headers: {
          'content-type': sheet.type || 'image/jpeg',
          'x-print-request-id': requestId,
        },
        body: sheet,
      })
      serverResponded = true
      const payload = await response.json().catch(() => undefined) as PrintErrorResponse | undefined
      if (response.status === 409 && payload?.previousStatus === 'queued') {
        setPrintStatus('queued')
        return
      }
      if (!response.ok) {
        const statusUncertain = payload?.requestStatus === 'uncertain'
          || payload?.previousStatus === 'uncertain'
          || payload?.previousStatus === 'processing'
        if (!statusUncertain) printRequestIdRef.current = undefined
        throw new Error(payload?.message || 'Server lokal menolak job print.')
      }
      setPrintStatus('queued')
    } catch (error) {
      const message = requestSent && !serverResponded
        ? 'Koneksi ke server terputus. Coba lagi akan memeriksa permintaan yang sama agar tidak mencetak dua kali.'
        : error instanceof Error ? error.message : 'Foto gagal dikirim ke printer.'
      setPrintError(message)
      setPrintStatus('failed')
    } finally {
      printInFlightRef.current = false
    }
  }

  useEffect(() => {
    let active = true
    void preparePhotoSheet()
      .then((sheet) => {
        if (active) setPhotoSheet(sheet)
      })
      .catch(() => {
        if (active) setActionError('Hasil gagal dibuat.')
      })
    return () => {
      active = false
    }
  }, [preparePhotoSheet])

  useEffect(() => {
    let active = true
    void prepareShareSheet()
      .then((sheet) => {
        if (active) setShareSheet(sheet)
      })
      .catch(() => {
        if (active) setActionError('Hasil gagal dibuat.')
      })
    return () => {
      active = false
    }
  }, [prepareShareSheet])

  const createQr = useCallback(async () => {
    if (!liveResult || !shareSheet || shareInFlightRef.current || sharedResult) return
    shareInFlightRef.current = true
    setSharing(true)
    try {
      const shared = await shareService.publish(sessionId, { photo: shareSheet, live: liveResult })
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
  }, [liveResult, shareSheet, sessionId, shareService, sharedResult])

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
          <button
            className="secondary-button"
            type="button"
            onClick={() => void print()}
            disabled={isPrinting || printStatus === 'queued' || printStatus === 'failed'}
          >
            {printStatus === 'queued' ? '✓ Masuk antrean' : isPrinting ? '…' : '▣ Cetak 4R'}
          </button>
        </div>
        {printStatus !== 'idle' && (
          <p className={`print-status ${printStatus}`} aria-live="polite">
            {printStatusLabel[printStatus]}
          </p>
        )}
        {printError && <p className="form-error print-error" role="alert">{printError}</p>}
        {printStatus === 'failed' && (
          <button className="secondary-button print-retry" type="button" onClick={() => void print()}>
            Coba cetak lagi
          </button>
        )}
        {sharing && <span className="qr-loading" aria-live="polite">•••</span>}
        {qrImage && <img className="download-qr" src={qrImage} alt="QR unduh foto dan Live Photo" />}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {actionError && !qrImage && <button className="secondary-button" type="button" onClick={() => void createQr()}>Coba lagi</button>}
        <button className="text-button" type="button" onClick={() => void startAgain()} disabled={destroying || sharing || isPrinting}>{destroying ? '…' : 'Mulai lagi →'}</button>
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
  const [photoAssignments, setPhotoAssignments] = useState<number[]>([])
  const [photoTransforms, setPhotoTransforms] = useState<PhotoTransform[]>(
    () => defaultPhotoTransforms.map((transform) => ({ ...transform })),
  )
  const [processingImage, setProcessingImage] = useState<Blob>()
  const [fatalError, setFatalError] = useState('')

  const selectedFrame = useMemo(() => {
    return frames.find((item) => item.id === selectedFrameId) ?? frames[0]
  }, [frames, selectedFrameId])
  const requiredPhotoCount = resolveConfiguredPhotoCount()
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
    const assignments = Array.from({ length: slotCount }, (_, index) => Math.min(index, resolveConfiguredPhotoCount() - 1))
    setPhotoAssignments(assignments)
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
    if (!session || !selectedFrame) return
    const capturingSession: BoothSession = {
      ...session,
      frameId: selectedFrame.id,
      photos: [],
      livePhotos: [],
      status: 'capturing',
    }
    const assignments = Array.from({ length: resolveFrameSlots(selectedFrame).length }, (_, index) => Math.min(index, requiredPhotoCount - 1))
    await container.sessionService.save(capturingSession)
    setSession(capturingSession)
    setCameraSlots(allCameraSlots)
    setPhotoAssignments(assignments)
    setPhotoTransforms(Array.from({ length: requiredPhotoCount }, (_, index) => ({
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

    const frameSlotCount = resolveFrameSlots(selectedFrame).length
    const finalPhotos = Array.from({ length: frameSlotCount }, (_, slotIndex) => {
      const sourceIndex = photoAssignments[slotIndex] ?? slotIndex
      return session.photos[sourceIndex] ?? session.photos[slotIndex] ?? ''
    })
    const finalLivePhotos = Array.from({ length: frameSlotCount }, (_, slotIndex) => {
      const sourceIndex = photoAssignments[slotIndex] ?? slotIndex
      return session.livePhotos[sourceIndex] ?? session.livePhotos[slotIndex]
    })
    const finalTransforms = Array.from({ length: frameSlotCount }, (_, slotIndex) =>
      photoTransforms[slotIndex] ?? defaultPhotoTransforms[slotIndex] ?? defaultPhotoTransforms[0],
    )

    persistSession((current) => ({ ...current, status: 'processing' }))
    setScreen('processing')
    try {
      const finalImage = await composePhotoStrip(finalPhotos, selectedFrame, finalTransforms)
      setProcessingImage(finalImage)
      const finalLive = await composeLiveTemplate(
        finalPhotos,
        finalLivePhotos,
        selectedFrame,
        finalTransforms,
      ).catch(() => undefined)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 7_000))
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
      setScreen('result')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Hasil foto gagal dibuat.'
      setFatalError(message)
      persistSession((current) => ({ ...current, status: 'failed' }))
      setScreen('review')
    }
  }

  const reset = () => {
    setSession(undefined)
    setProcessingImage(undefined)
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
        photoAssignments={photoAssignments}
        onPhotoAssignmentChange={(slot, photoIndex) => {
          setPhotoAssignments((current) => {
            const targetLength = resolveFrameSlots(selectedFrame).length
            const next = current.length === targetLength
              ? [...current]
              : Array.from({ length: targetLength }, (_, index) => current[index] ?? index)

            next[slot] = photoIndex
            return next
          })
        }}
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

  if (screen === 'processing') return <ProcessingPage image={processingImage} />

  if (screen === 'result' && session?.finalImage) {
    return <ResultPage result={session.finalImage} liveResult={session.finalLive} sessionId={session.id} shareService={container.shareService} onDone={reset} />
  }

  return <LandingPage onStart={() => void startSession()} onOperator={() => void openOperator()} />
}
