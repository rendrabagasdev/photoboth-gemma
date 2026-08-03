import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join } from 'node:path'

const DEFAULT_MAX_FILE_MB = 20
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000
const REQUEST_ID_TTL_MS = 2 * 60 * 1_000
const HEALTH_CACHE_MS = 5_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])

type CommandResult = {
  stdout: string
  stderr: string
}

type PrinterHealth = {
  name: string
  available: boolean
  state?: string
}

type PrintConfig = {
  printerName: string
  tempDir: string
  maxFileBytes: number
  commandTimeoutMs: number
  media?: string
  quality?: string
  fitToPage: boolean
}

class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const recentRequestIds = new Map<string, number>()
let healthCache: { expiresAt: number; value: PrinterHealth } | undefined

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function safeOption(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  if (!normalized) return undefined
  if (normalized.length > 100 || normalized.includes('\0') || /[\r\n]/.test(normalized)) {
    throw new Error('Opsi print pada environment tidak valid.')
  }
  return normalized
}

function printConfig(): PrintConfig {
  const printerName = safeOption(process.env.PRINTER_NAME) ?? ''
  const maxFileMb = numberFromEnv(process.env.MAX_PRINT_FILE_MB, DEFAULT_MAX_FILE_MB)
  return {
    printerName,
    tempDir: process.env.PRINT_TEMP_DIR?.trim() || '/tmp/photobooth-print',
    maxFileBytes: Math.floor(maxFileMb * 1024 * 1024),
    commandTimeoutMs: numberFromEnv(process.env.PRINT_COMMAND_TIMEOUT_MS, DEFAULT_COMMAND_TIMEOUT_MS),
    media: safeOption(process.env.PRINT_MEDIA),
    quality: safeOption(process.env.PRINT_QUALITY),
    fitToPage: (process.env.PRINT_FIT_TO_PAGE ?? 'true').toLowerCase() === 'true',
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(value))
}

function runCommand(command: string, args: string[], timeout: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stdout, stderr })
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function commandErrorText(error: unknown): string {
  if (!(error instanceof Error)) return ''
  const details = error as Error & { stdout?: string; stderr?: string }
  return `${details.message}\n${details.stdout ?? ''}\n${details.stderr ?? ''}`.toLowerCase()
}

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const details = error as Error & { killed?: boolean; signal?: string; code?: string }
  return details.killed === true || details.signal === 'SIGTERM' || details.code === 'ETIMEDOUT'
}

function isMissingCommand(error: unknown): boolean {
  return error instanceof Error && (error as Error & { code?: string }).code === 'ENOENT'
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'file_too_large', 'Ukuran foto melebihi batas server.')
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) {
      throw new HttpError(413, 'file_too_large', 'Ukuran foto melebihi batas server.')
    }
    chunks.push(buffer)
  }
  if (size === 0) throw new HttpError(400, 'empty_file', 'File foto kosong.')
  return Buffer.concat(chunks)
}

function validateImage(contentType: string, body: Buffer): '.jpg' | '.png' {
  if (contentType === 'image/jpeg') {
    const valid = body.byteLength >= 4
      && body[0] === 0xff
      && body[1] === 0xd8
      && body[body.byteLength - 2] === 0xff
      && body[body.byteLength - 1] === 0xd9
    if (!valid) throw new HttpError(400, 'invalid_file', 'Isi file bukan JPEG yang valid.')
    return '.jpg'
  }

  if (contentType === 'image/png') {
    const valid = body.byteLength >= 20
      && body.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
      && body.subarray(-PNG_END.byteLength).equals(PNG_END)
    if (!valid) throw new HttpError(400, 'invalid_file', 'Isi file bukan PNG yang valid.')
    return '.png'
  }

  throw new HttpError(415, 'unsupported_content_type', 'Content-Type harus image/jpeg atau image/png.')
}

function reserveRequestId(requestId: string): void {
  const now = Date.now()
  for (const [id, expiresAt] of recentRequestIds) {
    if (expiresAt <= now) recentRequestIds.delete(id)
  }
  if (!UUID_PATTERN.test(requestId)) {
    throw new HttpError(400, 'invalid_request_id', 'X-Print-Request-Id harus berupa UUID.')
  }
  if (recentRequestIds.has(requestId)) {
    throw new HttpError(409, 'duplicate_print', 'Permintaan print yang sama sudah diterima.')
  }
  recentRequestIds.set(requestId, now + REQUEST_ID_TTL_MS)
}

async function inspectPrinter(config: PrintConfig): Promise<PrinterHealth> {
  if (!config.printerName) {
    return { name: '', available: false, state: 'PRINTER_NAME belum dikonfigurasi' }
  }
  try {
    const { stdout, stderr } = await runCommand(
      'lpstat',
      ['-p', config.printerName],
      Math.min(config.commandTimeoutMs, 3_000),
    )
    const output = `${stdout}\n${stderr}`.trim()
    const unavailable = /\b(disabled|offline|not responding|unreachable)\b/i.test(output)
    return {
      name: config.printerName,
      available: !unavailable,
      state: output || (unavailable ? 'unavailable' : 'ready'),
    }
  } catch (error) {
    if (isMissingCommand(error)) {
      return { name: config.printerName, available: false, state: 'lpstat tidak ditemukan' }
    }
    if (isTimeout(error)) {
      return { name: config.printerName, available: false, state: 'Pemeriksaan printer timeout' }
    }
    const text = commandErrorText(error)
    const state = /unknown (printer|destination)|invalid destination|not found|does not exist|no destinations/i.test(text)
      ? 'Queue printer tidak ditemukan'
      : 'Printer tidak tersedia'
    return { name: config.printerName, available: false, state }
  }
}

async function cachedPrinterHealth(config: PrintConfig): Promise<PrinterHealth> {
  if (healthCache && healthCache.expiresAt > Date.now() && healthCache.value.name === config.printerName) {
    return healthCache.value
  }
  const value = await inspectPrinter(config)
  healthCache = { value, expiresAt: Date.now() + HEALTH_CACHE_MS }
  return value
}

function lpFailure(error: unknown): HttpError {
  if (isMissingCommand(error)) {
    return new HttpError(503, 'cups_command_missing', 'Command lp tidak ditemukan di server Fedora.')
  }
  if (isTimeout(error)) {
    return new HttpError(504, 'print_timeout', 'Pengiriman job ke CUPS mengalami timeout.')
  }
  const text = commandErrorText(error)
  if (/unknown (printer|destination)|invalid destination|not found|does not exist|no destinations/i.test(text)) {
    return new HttpError(503, 'printer_queue_not_found', 'Queue printer tidak ditemukan.')
  }
  if (/disabled|offline|not responding|unreachable|unable to connect/i.test(text)) {
    return new HttpError(503, 'printer_offline', 'Printer sedang offline atau queue dinonaktifkan.')
  }
  return new HttpError(502, 'print_command_failed', 'CUPS menolak job print.')
}

export async function handleHealth(response: ServerResponse): Promise<void> {
  try {
    const printer = await cachedPrinterHealth(printConfig())
    sendJson(response, 200, { status: 'ok', printer })
  } catch (error) {
    sendJson(response, 500, {
      status: 'error',
      printer: { name: process.env.PRINTER_NAME?.trim() ?? '', available: false },
      error: error instanceof Error ? error.message : 'Konfigurasi printer tidak valid.',
    })
  }
}

export async function handlePrint(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let tempFile = ''
  try {
    const config = printConfig()
    if (!config.printerName) {
      throw new HttpError(503, 'printer_not_configured', 'PRINTER_NAME belum dikonfigurasi.')
    }

    const requestId = String(request.headers['x-print-request-id'] ?? '').trim()
    reserveRequestId(requestId)

    const rawContentType = String(request.headers['content-type'] ?? '')
    const contentType = rawContentType.split(';', 1)[0].trim().toLowerCase()
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
      throw new HttpError(415, 'unsupported_content_type', 'Content-Type harus image/jpeg atau image/png.')
    }

    const body = await readBody(request, config.maxFileBytes)
    const extension = validateImage(contentType, body)
    const health = await inspectPrinter(config)
    healthCache = { value: health, expiresAt: Date.now() + HEALTH_CACHE_MS }
    if (!health.available) {
      if (health.state === 'lpstat tidak ditemukan') {
        throw new HttpError(503, 'cups_command_missing', 'Command lpstat tidak ditemukan di server Fedora.')
      }
      if (health.state === 'Pemeriksaan printer timeout') {
        throw new HttpError(504, 'printer_check_timeout', 'Pemeriksaan printer mengalami timeout.')
      }
      if (health.state === 'Queue printer tidak ditemukan') {
        throw new HttpError(503, 'printer_queue_not_found', 'Queue printer tidak ditemukan.')
      }
      throw new HttpError(503, 'printer_offline', 'Printer sedang offline atau tidak tersedia.')
    }

    await mkdir(config.tempDir, { recursive: true, mode: 0o700 })
    tempFile = join(config.tempDir, `photo-${randomUUID()}${extension}`)
    if (!['.jpg', '.png'].includes(extname(tempFile))) {
      throw new HttpError(500, 'invalid_temp_file', 'Ekstensi file sementara tidak valid.')
    }
    await writeFile(tempFile, body, { flag: 'wx', mode: 0o600 })

    const args = ['-d', config.printerName]
    if (config.media) args.push('-o', `media=${config.media}`)
    if (config.quality) args.push('-o', `print-quality=${config.quality}`)
    if (config.fitToPage) args.push('-o', 'fit-to-page')
    args.push(tempFile)

    let output: CommandResult
    try {
      output = await runCommand('lp', args, config.commandTimeoutMs)
    } catch (error) {
      throw lpFailure(error)
    }

    const match = output.stdout.match(/request id is\s+(\S+)/i)
    sendJson(response, 202, {
      status: 'queued',
      message: 'Foto masuk antrean CUPS.',
      requestId,
      printer: config.printerName,
      jobId: match?.[1] ?? null,
    })
  } catch (error) {
    const failure = error instanceof HttpError
      ? error
      : new HttpError(500, 'print_failed', 'Foto gagal dikirim ke CUPS.')
    if (!(error instanceof HttpError)) console.error('[print]', error)
    sendJson(response, failure.status, { status: 'error', error: failure.code, message: failure.message })
  } finally {
    if (tempFile) {
      await unlink(tempFile).catch((error: unknown) => {
        console.error('[print] File sementara gagal dihapus:', error)
      })
    }
  }
}
