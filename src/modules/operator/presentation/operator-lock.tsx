import { useState, type FormEvent } from 'react'

type OperatorLockProps = {
  onUnlock: (pin: string) => Promise<void>
  onCancel: () => void
}

export function OperatorLock({ onUnlock, onCancel }: OperatorLockProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onUnlock(pin)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tidak dapat membuka dashboard.')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="operator-lock-page">
      <button className="icon-button operator-back" type="button" onClick={onCancel} aria-label="Kembali">
        ←
      </button>
      <form className="pin-card" onSubmit={submit}>
        <div className="brand-mark small">TB</div>
        <p className="eyebrow">AREA OPERATOR</p>
        <h1>Masukkan PIN</h1>
        <p>Dashboard ini hanya untuk petugas photobooth.</p>
        <label htmlFor="operator-pin">PIN operator</label>
        <input
          id="operator-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          placeholder="••••"
          autoFocus
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button full" type="submit" disabled={busy || pin.length < 4}>
          {busy ? 'Memeriksa…' : 'Buka dashboard'}
        </button>
        <small>PIN operator diatur melalui environment perangkat.</small>
      </form>
    </main>
  )
}
