import { motion } from 'framer-motion'
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
    <main className="flex flex-col justify-between items-center h-screen overflow-hidden">
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

const processingPrintLabel: Record<PrintStatus, string> = {
  idle: 'JUST A MOMENT\nPLEASE',
  preparing: 'PREPARING PRINTER\nPLEASE WAIT',
  sending: 'SENDING TO PRINTER\nPLEASE WAIT',
  queued: 'PRINT QUEUED\nTHANK YOU',
  failed: 'PRINT FAILED\nCHECK PRINTER',
}

function ProcessingPage({ image, printStatus, printError }: { image?: Blob; printStatus: PrintStatus; printError: string }) {
  const imageUrl = useObjectUrl(image)
  const statusLines = (printError || processingPrintLabel[printStatus]).split('\n')

  return (
    <main className="relative flex h-screen w-screen flex-col items-center gap-4 overflow-hidden bg-[url('/bg_print.png')] bg-cover bg-center bg-no-repeat">
      <img
        src="/bg_fragment.svg"
        alt=""
        className="absolute left-0 top-0 z-20 w-full origin-top scale-[1.072] object-cover"
      />

      <div className="
                absolute
                top-30
                left-1/2
                -translate-x-1/2
                w-100
        h-20
        bg-linear-to-b
        from-black
        via-black
        to-transparent
        opacity-90
                z-20
        pointer-events-none
    " />

      <span id="print-debug" className="absolute bottom-40 z-30 text-center text-4xl font-sns tracking-[0.11em]">
        {statusLines[0]} <br /> {statusLines[1] ?? 'CHECK PRINTER'}
      </span>
      {imageUrl && (
        <motion.img
          key={imageUrl}
          src={imageUrl}
          alt="Hasil foto sedang diproses"
          className="absolute top-55 w-56"
          initial={{ y: '-130%' }}
          animate={{ y: '-5%' }}
          transition={{ duration: 6, ease: 'easeInOut' }}
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
  autoPrint = false,
  preparedQrImage,
  preparedSharedResult,
}: {
  result: Blob
  liveResult?: Blob
  sessionId: string
  shareService: ShareService
  onDone: () => void
  autoPrint?: boolean
  preparedQrImage?: string
  preparedSharedResult?: SharedResult
}) {
  const [photoSheet, setPhotoSheet] = useState<Blob>()
  const [shareSheet, setShareSheet] = useState<Blob>()
  const [qrImage, setQrImage] = useState(preparedQrImage ?? '')
  const [sharedResult, setSharedResult] = useState<SharedResult | undefined>(preparedSharedResult)
  const shareInFlightRef = useRef(false)
  const printInFlightRef = useRef(false)
  const printRequestIdRef = useRef<string | undefined>(undefined)
  const photoSheetInFlightRef = useRef<Promise<Blob> | undefined>(undefined)
  const shareSheetInFlightRef = useRef<Promise<Blob> | undefined>(undefined)
  const [printStatus, setPrintStatus] = useState<PrintStatus>('idle')

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
    setPrintStatus('preparing')
    try {
      const sheet = await preparePhotoSheet()
      setPrintStatus('sending')
      const requestId = printRequestIdRef.current ?? createUuid()
      printRequestIdRef.current = requestId
      const response = await fetch('/api/print', {
        method: 'POST',
        headers: {
          'content-type': sheet.type || 'image/jpeg',
          'x-print-request-id': requestId,
        },
        body: sheet,
      })
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
    } catch {
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
        if (active) setPhotoSheet(undefined)
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
        if (active) setShareSheet(undefined)
      })
    return () => {
      active = false
    }
  }, [prepareShareSheet])

  useEffect(() => {
    if (autoPrint) void print()
  }, [autoPrint])

  const createQr = useCallback(async () => {
    if (!liveResult || !shareSheet || shareInFlightRef.current || sharedResult) return
    shareInFlightRef.current = true
    try {
      const shared = await shareService.publish(sessionId, { photo: shareSheet, live: liveResult })
      const image = await QRCode.toDataURL(shared.downloadUrl, {
        width: 420,
        margin: 2,
        color: {
          dark: readThemeColor('--theme-ink', '#171711'),
          light: readThemeColor('--theme-paper', '#F4F0E2'),
        },
        errorCorrectionLevel: 'M',
      })
      setSharedResult(shared)
      setQrImage(image)
    } catch {
      setQrImage('')
    } finally {
      shareInFlightRef.current = false
    }
  }, [liveResult, shareSheet, sessionId, shareService, sharedResult])

  const startAgain = async () => {
    if (sharedResult) {
      await shareService.destroy(sharedResult.id, sharedResult.destroyToken).catch(() => undefined)
    }
    onDone()
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void createQr(), 0)
    return () => window.clearTimeout(timer)
  }, [createQr])

  return (
    <main className="relative flex h-screen w-screen flex-col items-center gap-4 overflow-hidden bg-[url('/bg_print.png')] bg-cover bg-center bg-no-repeat">
      <img
        src="/bg_fragment.svg"
        alt=""
        className="absolute left-0 top-0 z-20 w-full origin-top  object-cover scale-[1.072]"
      />
      <div className="
                absolute
                top-30
                left-1/2
                -translate-x-1/2
                w-100
        h-20
        bg-linear-to-b
        from-black
        via-black
        to-transparent
        opacity-90
        z-20
        pointer-events-none
    " />
      <button
        type="button"
        onClick={() => void startAgain()}
        aria-label="Mulai lagi"
        className="absolute bottom-40 z-30  bg-transparent p-0  font-sns tracking-[0.11em] text-center "
      >
        <p className="text-4xl" >
          JUST A MOMENT <br /> PLEASE
        </p>

      </button>
      {qrImage && (
        <div className="w-100 h-180 flex flex-col justify-end items-center bg-[var(--theme-paper)] text-black absolute top-30 gap-8 qr_container pb-10" >
          <img className="w-30" src="picto_text_hitam.svg" alt="Picto Text" />
          <span className="text-4xl text-center"> SCAN FOR <br /> DOWNLOAD </span>
          <img
            src={qrImage}
            alt="QR unduh foto dan Live Photo"
            className="w-80 "
          />
        </div>
      )}
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
  const [processingQrImage, setProcessingQrImage] = useState('')
  const [processingSharedResult, setProcessingSharedResult] = useState<SharedResult>()
  const [processingPrintStatus, setProcessingPrintStatus] = useState<PrintStatus>('idle')
  const [processingPrintError, setProcessingPrintError] = useState('')
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

  const finalize = async (printAfterFinalize = false) => {
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
      const printPromise = printAfterFinalize
        ? (async () => {
          setProcessingPrintStatus('preparing')
          setProcessingPrintError('')
          try {
            const printSheet = await composePhotoSheet(finalImage, { variant: 'print' })
            setProcessingPrintStatus('sending')
            const response = await fetch('/api/print', {
              method: 'POST',
              headers: {
                'content-type': printSheet.type || 'image/jpeg',
                'x-print-request-id': createUuid(),
              },
              body: printSheet,
            })
            const payload = await response.json().catch(() => undefined) as PrintErrorResponse | undefined
            if (!response.ok) {
              throw new Error(payload?.message || (response.status === 503 ? 'PRINTER NOT CONNECTED' : 'PRINTER REJECTED'))
            }
            setProcessingPrintStatus('queued')
          } catch (error) {
            const message = error instanceof TypeError
              ? 'PRINTER CONNECTION LOST'
              : error instanceof Error ? error.message : 'PRINT FAILED'
            setProcessingPrintError(message.toUpperCase())
            setProcessingPrintStatus('failed')
          }
        })()
        : Promise.resolve()
      const finalLivePromise = composeLiveTemplate(
        finalPhotos,
        finalLivePhotos,
        selectedFrame,
        finalTransforms,
      ).catch(() => undefined)
      const shareSheetPromise = composePhotoSheet(finalImage, { variant: 'download' })
      const finalLive = await finalLivePromise
      const qrPromise = finalLive
        ? shareSheetPromise
          .then((shareSheet) => container.shareService.publish(session.id, { photo: shareSheet, live: finalLive }))
          .then(async (shared) => {
            const qrImage = await QRCode.toDataURL(shared.downloadUrl, {
              width: 420,
              margin: 2,
              color: {
                dark: readThemeColor('--theme-ink', '#171711'),
                light: readThemeColor('--theme-paper', '#F4F0E2'),
              },
              errorCorrectionLevel: 'M',
            })
            return { shared, qrImage }
          })
          .catch(() => undefined)
        : Promise.resolve(undefined)

      const [qrResult] = await Promise.all([
        qrPromise,
        printPromise,
        new Promise<void>((resolve) => window.setTimeout(resolve, 7_000)),
      ])
      if (qrResult) {
        setProcessingSharedResult(qrResult.shared)
        setProcessingQrImage(qrResult.qrImage)
      }
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
    setProcessingQrImage('')
    setProcessingSharedResult(undefined)
    setProcessingPrintStatus('idle')
    setProcessingPrintError('')
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
        onContinue={() => void finalize(true)}
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

  if (screen === 'processing') return <ProcessingPage image={processingImage} printStatus={processingPrintStatus} printError={processingPrintError} />

  if (screen === 'result' && session?.finalImage) {
    return <ResultPage result={session.finalImage} liveResult={session.finalLive} sessionId={session.id} shareService={container.shareService} onDone={reset} autoPrint={false} preparedQrImage={processingQrImage} preparedSharedResult={processingSharedResult} />
  }

  return <LandingPage onStart={() => void startSession()} onOperator={() => void openOperator()} />
}
