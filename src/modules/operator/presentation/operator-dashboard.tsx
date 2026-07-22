import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { FrameService } from '../../frames/application/frame-service'
import type { PhotoFrame } from '../../frames/domain/photo-frame'
import { FramePreview } from '../../frames/presentation/frame-preview'
import type { SessionService } from '../../sessions/application/session-service'
import type { BoothSession } from '../../sessions/domain/booth-session'

type OperatorDashboardProps = {
  frameService: FrameService
  sessionService: SessionService
  onFramesChanged: (frames: PhotoFrame[]) => void
  onExit: () => void
}

export function OperatorDashboard({
  frameService,
  sessionService,
  onFramesChanged,
  onExit,
}: OperatorDashboardProps) {
  const exampleTemplateUrl = `${import.meta.env.BASE_URL}templates/tobfest-4r-portrait-example.png`
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [frames, setFrames] = useState<PhotoFrame[]>([])
  const [sessions, setSessions] = useState<BoothSession[]>([])
  const [showAddFrame, setShowAddFrame] = useState(false)
  const [frameName, setFrameName] = useState('')
  const [frameFile, setFrameFile] = useState<File>()
  const [frameActive, setFrameActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [storageLabel, setStorageLabel] = useState('Memeriksa…')

  const refresh = async () => {
    const [nextFrames, nextSessions] = await Promise.all([
      frameService.list(),
      sessionService.recent(),
    ])
    setFrames(nextFrames)
    setSessions(nextSessions)
    onFramesChanged(nextFrames.filter((frame) => frame.isActive))
  }

  useEffect(() => {
    let cancelled = false

    void Promise.all([frameService.list(), sessionService.recent()]).then(
      ([nextFrames, nextSessions]) => {
        if (cancelled) return
        setFrames(nextFrames)
        setSessions(nextSessions)
        onFramesChanged(nextFrames.filter((frame) => frame.isActive))
      },
    )
    void navigator.storage?.estimate().then((estimate) => {
      if (cancelled) return
      if (!estimate.quota) {
        setStorageLabel('Tersedia')
        return
      }
      const used = estimate.usage ?? 0
      const percentage = Math.round((used / estimate.quota) * 100)
      setStorageLabel(`${percentage}% terpakai`)
    })

    return () => {
      cancelled = true
    }
  }, [frameService, onFramesChanged, sessionService])

  const showMessage = (message: string) => {
    setNotice(message)
    setError('')
    window.setTimeout(() => setNotice(''), 3000)
  }

  const handleFailure = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : 'Tindakan gagal dilakukan.')
    setNotice('')
  }

  const addFrame = async (event: FormEvent) => {
    event.preventDefault()
    if (!frameFile) {
      setError('Pilih file PNG terlebih dahulu.')
      return
    }

    setBusy(true)
    try {
      await frameService.add({ name: frameName, imageBlob: frameFile, isActive: frameActive })
      setFrameName('')
      setFrameFile(undefined)
      setFrameActive(true)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowAddFrame(false)
      await refresh()
      showMessage('Frame baru berhasil ditambahkan.')
    } catch (reason) {
      handleFailure(reason)
    } finally {
      setBusy(false)
    }
  }

  const changeFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setFrameFile(file)
    setError('')
  }

  const toggleFrame = async (frame: PhotoFrame) => {
    try {
      await frameService.setActive(frame, !frame.isActive)
      await refresh()
      showMessage(`${frame.name} ${frame.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`)
    } catch (reason) {
      handleFailure(reason)
    }
  }

  const makeDefault = async (frame: PhotoFrame) => {
    try {
      await frameService.setDefault(frame)
      await refresh()
      showMessage(`${frame.name} menjadi frame default.`)
    } catch (reason) {
      handleFailure(reason)
    }
  }

  const deleteFrame = async (frame: PhotoFrame) => {
    try {
      await frameService.remove(frame)
      await refresh()
      showMessage(`${frame.name} dihapus.`)
    } catch (reason) {
      handleFailure(reason)
    }
  }

  const clearSessions = async () => {
    try {
      await sessionService.clearCompleted()
      await refresh()
      showMessage('Riwayat sesi yang selesai sudah dibersihkan.')
    } catch (reason) {
      handleFailure(reason)
    }
  }

  const completedCount = sessions.filter((session) => session.status === 'completed').length

  return (
    <main className="operator-page">
      <aside className="operator-sidebar">
        <div className="operator-brand"><span className="brand-mark small">TB</span><strong>TOB BOOTH</strong></div>
        <nav aria-label="Menu operator">
          <a className="active" href="#overview"><span>⌂</span> Ringkasan</a>
          <a href="#frames"><span>▣</span> Kelola frame</a>
          <a href="#sessions"><span>◷</span> Riwayat sesi</a>
        </nav>
        <div className="sidebar-footer">
          <span><i /> Perangkat siap</span>
          <button type="button" onClick={onExit}>Keluar ke kiosk →</button>
        </div>
      </aside>

      <div className="operator-content">
        <header className="operator-header" id="overview">
          <div>
            <p className="eyebrow">DASHBOARD OPERATOR</p>
            <h1>Siap untuk hari yang seru.</h1>
            <p>Kelola frame dan pastikan iPad siap sebelum pengunjung datang.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setShowAddFrame(true)}>
            <span>＋</span> Tambah frame
          </button>
        </header>

        {(notice || error) && (
          <div className={`toast ${error ? 'error' : ''}`} role="status">
            {error || notice}
            <button type="button" onClick={() => { setError(''); setNotice('') }}>×</button>
          </div>
        )}

        <section className="stats-grid" aria-label="Status perangkat">
          <article><span className="stat-icon coral">●</span><p><small>Kamera depan</small><strong>{navigator.mediaDevices ? 'Tersedia' : 'Tidak tersedia'}</strong></p><em className="good">SIAP</em></article>
          <article><span className="stat-icon lime">▣</span><p><small>Frame aktif</small><strong>{frames.filter((frame) => frame.isActive).length} desain</strong></p><em className="good">LOKAL</em></article>
          <article><span className="stat-icon blue">◉</span><p><small>Sesi terbaru</small><strong>{completedCount} selesai</strong></p><em>IPAD INI</em></article>
          <article><span className="stat-icon yellow">◒</span><p><small>Penyimpanan</small><strong>{storageLabel}</strong></p><em className="good">AMAN</em></article>
        </section>

        <section className="operator-section" id="frames">
          <div className="section-title">
            <div><p className="eyebrow">FRAME ACARA</p><h2>Pilih yang tampil di kiosk</h2></div>
            <span>{frames.length} frame tersimpan</span>
          </div>
          <div className="manager-frame-grid">
            {frames.map((frame) => (
              <article className={`manager-frame-card ${frame.isActive ? '' : 'inactive'}`} key={frame.id}>
                <FramePreview frame={frame} compact />
                <div className="manager-frame-copy">
                  <div><strong>{frame.name}</strong><small>{frame.kind === 'preset' ? 'Frame bawaan' : 'Unggahan operator'}</small></div>
                  {frame.isDefault && <span className="default-badge">DEFAULT</span>}
                </div>
                <div className="manager-actions">
                  <label className="switch">
                    <input type="checkbox" checked={frame.isActive} onChange={() => void toggleFrame(frame)} />
                    <span />
                    {frame.isActive ? 'Aktif' : 'Nonaktif'}
                  </label>
                  <button type="button" onClick={() => void makeDefault(frame)} disabled={frame.isDefault}>Jadikan default</button>
                  {frame.kind === 'uploaded' && <button className="danger-link" type="button" onClick={() => void deleteFrame(frame)}>Hapus</button>}
                </div>
              </article>
            ))}
            <button className="add-frame-card" type="button" onClick={() => setShowAddFrame(true)}>
              <span>＋</span><strong>Tambah frame baru</strong><small>PNG transparan · maks. 10 MB</small>
            </button>
          </div>
        </section>

        <section className="operator-section session-section" id="sessions">
          <div className="section-title">
            <div><p className="eyebrow">PERANGKAT LOKAL</p><h2>Sesi terakhir</h2></div>
            <button type="button" onClick={() => void clearSessions()} disabled={sessions.length === 0}>Bersihkan sesi selesai</button>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-sessions"><span>◷</span><p><strong>Belum ada sesi</strong><small>Sesi pengunjung akan muncul di sini.</small></p></div>
          ) : (
            <div className="session-list">
              {sessions.slice(0, 6).map((session) => (
                <div key={session.id}>
                  <span className={`session-state ${session.status}`} />
                  <p><strong>#{session.id.slice(0, 6).toUpperCase()}</strong><small>{new Date(session.createdAt).toLocaleString('id-ID')}</small></p>
                  <em>{session.status}</em>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showAddFrame && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowAddFrame(false)}>
          <form className="frame-dialog" onSubmit={addFrame} onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" type="button" onClick={() => setShowAddFrame(false)} aria-label="Tutup">×</button>
            <p className="eyebrow">FRAME BARU</p>
            <h2>Tambahkan desain acara</h2>
            <p>Gunakan template penuh PNG transparan 4R portrait berukuran 1200 × 1800 px.</p>
            <a
              className="template-example-link"
              href={exampleTemplateUrl}
              download="tobfest-4r-portrait-example.png"
            >
              ↓ Unduh contoh template
            </a>
            <label htmlFor="frame-name">Nama frame</label>
            <input id="frame-name" value={frameName} onChange={(event) => setFrameName(event.target.value)} placeholder="Contoh: Opening Night" />
            <label className={`upload-field ${frameFile ? 'has-file' : ''}`} htmlFor="frame-file">
              <span>{frameFile ? '✓' : '＋'}</span>
              <strong>{frameFile?.name ?? 'Pilih file PNG'}</strong>
              <small>{frameFile ? `${(frameFile.size / 1024 / 1024).toFixed(2)} MB` : 'Ketuk untuk membuka Files di iPad'}</small>
            </label>
            <input ref={fileInputRef} id="frame-file" className="visually-hidden" type="file" accept="image/png" onChange={changeFile} />
            <label className="active-checkbox">
              <input type="checkbox" checked={frameActive} onChange={(event) => setFrameActive(event.target.checked)} />
              <span><strong>Langsung aktifkan frame</strong><small>Frame akan muncul di layar pengunjung.</small></span>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={() => setShowAddFrame(false)}>Batal</button>
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan frame'}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
