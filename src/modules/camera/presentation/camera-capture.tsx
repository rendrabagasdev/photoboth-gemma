import { motion } from 'framer-motion'
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
type TimerSeconds = 1
type CameraFilter = 'normal' | 'warm' | 'mono'
type LensMode = 'wide' | 'normal'
type CameraAspect = '5:4'

type CameraErrorInfo = {
  title: string
  message: string
  hint: string
}

const cameraAspectOptions: Record<CameraAspect, { width: number; height: number; ratio: number }> = {
  '5:4': { width: 1500, height: 1200, ratio: 5 / 4 },
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function describeCameraError(error: string | DOMException): CameraErrorInfo {
  if (!window.isSecureContext) {
    return {
      title: 'Kamera memerlukan HTTPS',
      message: 'Halaman dibuka melalui koneksi yang tidak dianggap aman oleh iPad.',
      hint: 'Buka alamat HTTPS Fedora dan pastikan sertifikatnya sudah dipercaya di iPad.',
    }
  }

  const name = typeof error === 'string' ? error : error.name
  const message = typeof error === 'string' ? error : error.message
  const details = `${name} ${message}`.toLowerCase()

  if (/notallowed|permission|denied|security/.test(details)) {
    return {
      title: 'Izin kamera ditolak',
      message: 'Safari belum mendapat izin memakai kamera untuk alamat photobooth ini.',
      hint: 'Ubah Camera menjadi Allow pada pengaturan situs Safari, lalu tekan Coba lagi.',
    }
  }
  if (/notfound|devicesnotfound/.test(details)) {
    return {
      title: 'Kamera tidak ditemukan',
      message: 'iPad tidak melaporkan kamera yang dapat digunakan.',
      hint: 'Periksa pembatasan Screen Time/MDM, lalu restart Safari atau iPad.',
    }
  }
  if (/notreadable|trackstart|abort/.test(details)) {
    return {
      title: 'Kamera sedang tidak tersedia',
      message: 'Kamera mungkin sedang dipakai aplikasi lain atau belum dilepas oleh Safari.',
      hint: 'Tutup aplikasi kamera/video lain, kembali ke Safari, lalu tekan Coba lagi.',
    }
  }
  if (/overconstrained|constraint/.test(details)) {
    return {
      title: 'Mode kamera tidak didukung',
      message: 'Kamera tidak dapat memenuhi resolusi atau rasio yang dipilih.',
      hint: 'Kembali, buka kamera lagi, lalu gunakan rasio 4:5 dan mode Wide.',
    }
  }
  return {
    title: 'Kamera belum dapat digunakan',
    message: 'Safari gagal memulai kamera.',
    hint: 'Periksa HTTPS dan izin kamera, lalu tekan Coba lagi.',
  }
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
  const [timerSeconds] = useState<TimerSeconds>(1)
  const [cameraFilter, setCameraFilter] = useState<CameraFilter>('normal')
  const [lensMode] = useState<LensMode>('wide')
  const [cameraAspect] = useState<CameraAspect>('5:4')
  const [slotCursor, setSlotCursor] = useState(0)
  const [acceptedPhotos, setAcceptedPhotos] = useState<string[]>(photos)
  const [captureComplete, setCaptureComplete] = useState(startInReview)
  const [selectedPhotoSlot, setSelectedPhotoSlot] = useState<number>()
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [cameraError, setCameraError] = useState<CameraErrorInfo>()

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
    }
  }, [])

  const getFilterStyle = () => cameraFilter === 'warm'
    ? 'sepia(0.2) saturate(1.22) contrast(1.04)'
    : cameraFilter === 'mono'
      ? 'grayscale(1) contrast(1.08)'
      : 'none'

  useEffect(() => {
    const video = webcamRef.current?.video
    if (!video) return

    video.style.filter = getFilterStyle()
  }, [cameraFilter])

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

  const selectAccepted = (slot: number) => {
    setActiveSlot(slot)
    setSelectedPhotoSlot(slot)
  }

  const retryCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = undefined
    setCameraError(undefined)
    setCameraState('requesting')
    setCameraAttempt((current) => current + 1)
  }

  const retakeSelected = () => {
    if (selectedPhotoSlot === undefined) return
    const slot = selectedPhotoSlot
    setSelectedPhotoSlot(undefined)
    setActiveSlot(slot)
    setCaptureComplete(false)
    void runCapture({ slot, cursor: 0, stopAfterCapture: true, previewAfterCapture: true })
  }

  return (
    <main className="min-h-screen px-10 py-20">
      <section className="mx-auto max-w-275 flex justify-center flex-col">
        <div className="text-center ">
          <h2 className="text-2xl font-sns  uppercase tracking-[0.11em]">
            CLICK THE BUTTON AND POSE IN {timerSeconds} SECONDS
          </h2>
        </div>

        <div className="relative mx-auto w-full mt-10 overflow-hidden border border-white/10 bg-[#d1d1d1] " style={{ aspectRatio: '5 / 4', borderRadius: 0 }}>
          <Webcam
            key={`${cameraAspect}-${cameraAttempt}`}
            ref={webcamRef}
            audio={false}
            className="absolute inset-0 h-full w-full object-cover"
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
              setCameraError(undefined)
              setCameraState('ready')
            }}
            onUserMediaError={(error) => {
              setCameraError(describeCameraError(error))
              setCameraState('error')
            }}
            style={{ filter: getFilterStyle() }}
          />

          {selectedPhotoSlot !== undefined && acceptedPhotos[selectedPhotoSlot] && (
            <img
              className="absolute inset-0 h-full w-full object-cover"
              src={acceptedPhotos[selectedPhotoSlot]}
              alt={`Preview foto ${selectedPhotoSlot + 1}`}
              style={{ filter: getFilterStyle() }}
            />
          )}

          {cameraState === 'requesting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-4">
                <span className="h-12 w-12 animate-spin rounded-full border border-white/25 border-t-[#d6ff4d]" />
                <strong className="text-sm font-bold uppercase tracking-[0.2em]">Preparing…</strong>
              </div>
            </div>
          )}

          {cameraState === 'countdown' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 grid place-items-center bg-[#cfcfcf]/10"
              aria-live="assertive"
            >
              <motion.span
                key={countdown}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="select-none text-[clamp(6rem,18vw,15rem)] font-black leading-none tracking-[-0.08em] text-[#f4f2ec] drop-shadow-[0_12px_0_rgba(20,20,20,0.12)]"
              >
                {countdown}
              </motion.span>
            </motion.div>
          )}

          {cameraState === 'flash' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white/80" />}

          {cameraState === 'error' && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111111]/80 p-6 text-center shadow-2xl">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-[#ef3a2c] text-3xl font-black text-white">!</div>
                <h3 className="mb-2 text-xl font-black uppercase tracking-tight ">{cameraError?.title ?? 'Kamera belum dapat digunakan'}</h3>
                <p className="mb-3 text-sm leading-6 ">{cameraError?.message ?? 'Safari gagal memulai kamera.'}</p>
                <small className="block text-xs leading-5">{cameraError?.hint ?? 'Periksa HTTPS dan izin kamera.'}</small>
                <div className="mt-5 flex justify-center gap-3">
                  <button className="rounded-full  px-5 py-3 text-sm font-black uppercase text-black" type="button" onClick={retryCamera}>Coba lagi</button>
                  <button className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-black uppercase text-white" type="button" onClick={onCancel}>Kembali</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex w-full justify-center overflow-x-auto  mx-auto ">
          <div className="flex min-w-full gap-2  ">
            {Array.from({ length: totalSlots }, (_, slot) => (
              <motion.button
                key={slot}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => acceptedPhotos[slot] && selectAccepted(slot)}
                disabled={!acceptedPhotos[slot] || cameraState !== 'ready'}
                aria-label={acceptedPhotos[slot] ? `Tinjau foto ${slot + 1}` : `Foto ${slot + 1} belum diambil`}
                className={`relative h-40 w-50 shrink-0 overflow-hidden border border-white/60 bg-black  ${selectedPhotoSlot === slot ? 'ring-2 ring-white/80' : ''}`}
              >
                {acceptedPhotos[slot] ? (
                  <img
                    src={acceptedPhotos[slot]}
                    alt={`Foto ${slot + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ filter: getFilterStyle() }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-black" />
                )}

              </motion.button>
            ))}
          </div>
        </div>



        <div className="mt-5 w-full flex items-center justify-between mx-auto gap-8">

          <div className='flex items-end justify-end' >

            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={selectedPhotoSlot !== undefined ? retakeSelected : onCancel}
              style={{ filter: getFilterStyle() }}
              className="flex  items-center justify-center w-40 "
              aria-label="Retake photo"
            >
              <img src="button_retake.svg" alt="Retake" className="" />
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setCameraFilter((current) => current === 'normal' ? 'warm' : current === 'warm' ? 'mono' : 'normal')}
              className="flex w-20 items-center justify-center "
              aria-label={`Filter kamera saat ini: ${cameraFilter === 'normal' ? 'Normal' : cameraFilter === 'warm' ? 'Warm' : 'Mono'}`}
            >
              <img src="button_filter.svg" alt="Filter" className="" />
            </motion.button>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => (selectedPhotoSlot !== undefined ? onComplete() : void runCapture())}
            className="flex w-40 items-center justify-center mr-30"
            aria-label="Ambil foto"
            disabled={cameraState !== 'ready' && !captureComplete}
          >
            <img src="button_camera_on.svg" alt="capture" className="" />
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onComplete}
            className="flex w-40 items-center justify-center"
            aria-label="Lanjut"
          >
            <img src="button_next.svg" alt="Next" className="" />
          </motion.button>
        </div>
      </section>
    </main>
  )
}
