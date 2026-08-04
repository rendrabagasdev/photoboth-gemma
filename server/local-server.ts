import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { hostname as systemHostname } from 'node:os'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleHealth, handlePrint } from './local-print.js'
import { handleShareRoute } from './local-share.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const distDirectory = resolve(projectRoot, 'dist')
const DEFAULT_HTTP_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_MAX_SERVER_CONNECTIONS = 50
const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
}

function portFromEnvironment(): number {
  const port = Number(process.env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT harus berupa angka antara 1 dan 65535.')
  }
  return port
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function hostFromEnvironment(): string {
  const configured = process.env.HOSTNAME?.trim()
  // Fedora biasanya sudah mengisi HOSTNAME dengan nama mesin. Untuk photobooth,
  // nilai bawaan tersebut tetap diperlakukan sebagai bind ke semua interface.
  if (!configured || configured === systemHostname()) return '0.0.0.0'
  return configured
}

function publicOriginFromEnvironment(): string | undefined {
  const configured = process.env.PUBLIC_ORIGIN?.trim()
  if (!configured) return undefined

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('PUBLIC_ORIGIN harus berupa origin HTTP/HTTPS yang valid.')
  }

  const hasUnexpectedParts = url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || hasUnexpectedParts) {
    throw new Error('PUBLIC_ORIGIN hanya boleh berisi protocol, hostname, dan port opsional.')
  }

  return url.origin
}

function requestOrigin(request: IncomingMessage): string {
  const publicOrigin = publicOriginFromEnvironment()
  if (publicOrigin) return publicOrigin

  const encrypted = Boolean((request.socket as typeof request.socket & { encrypted?: boolean }).encrypted)
  const protocol = encrypted ? 'https' : 'http'
  const host = request.headers.host ?? `localhost:${process.env.PORT ?? 3000}`
  return `${protocol}://${host}`
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

async function sendFile(request: IncomingMessage, response: ServerResponse, filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return false
    const extension = extname(filePath).toLowerCase()
    response.statusCode = 200
    response.setHeader('content-type', mimeTypes[extension] ?? 'application/octet-stream')
    response.setHeader('content-length', info.size)
    response.setHeader(
      'cache-control',
      extension === '.html' || filePath.endsWith(`${sep}sw.js`)
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    )
    if (request.method === 'HEAD') {
      response.end()
      return true
    }
    await new Promise<void>((resolveStream, rejectStream) => {
      const stream = createReadStream(filePath)
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        response.off('close', handleClose)
        if (error) rejectStream(error)
        else resolveStream()
      }
      const handleClose = () => {
        stream.destroy()
        finish()
      }
      response.once('close', handleClose)
      stream.once('error', finish)
      stream.once('end', () => finish())
      stream.pipe(response)
    })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function handleStatic(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'method_not_allowed' })
    return
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    sendJson(response, 400, { error: 'invalid_path' })
    return
  }

  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const candidate = resolve(distDirectory, `.${requestedPath}`)
  if (candidate !== distDirectory && !candidate.startsWith(`${distDirectory}${sep}`)) {
    sendJson(response, 403, { error: 'forbidden' })
    return
  }

  if (await sendFile(request, response, candidate)) return
  if (extname(pathname)) {
    sendJson(response, 404, { error: 'not_found' })
    return
  }
  if (await sendFile(request, response, resolve(distDirectory, 'index.html'))) return
  sendJson(response, 503, { error: 'build_not_found', message: 'Jalankan npm run build sebelum npm run start.' })
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'same-origin')
  response.setHeader('cross-origin-resource-policy', 'same-origin')
  response.setHeader('permissions-policy', 'camera=(self), microphone=(self)')
  response.setHeader(
    'content-security-policy',
    "default-src 'self'; base-uri 'self'; connect-src 'self'; frame-ancestors 'none'; img-src 'self' blob: data:; manifest-src 'self'; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:",
  )
  const origin = requestOrigin(request)
  let url: URL
  try {
    url = new URL(request.url ?? '/', origin)
  } catch {
    sendJson(response, 400, { error: 'invalid_url' })
    return
  }

  const isMutation = request.method === 'POST' || request.method === 'DELETE'
  if (isMutation && url.pathname.startsWith('/api/')) {
    const fetchSite = request.headers['sec-fetch-site']
    const requestOriginHeader = request.headers.origin
    if (fetchSite === 'cross-site' || (requestOriginHeader && requestOriginHeader !== origin)) {
      sendJson(response, 403, { error: 'cross_site_request_blocked' })
      return
    }
  }

  if (url.pathname === '/api/health') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method_not_allowed' })
      return
    }
    await handleHealth(response)
    return
  }

  if (url.pathname === '/api/print') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' })
      return
    }
    await handlePrint(request, response)
    return
  }

  if (await handleShareRoute(request, response, url, origin)) return
  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'not_found' })
    return
  }
  await handleStatic(request, response, url)
}

async function main(): Promise<void> {
  const host = hostFromEnvironment()
  const port = portFromEnvironment()
  const publicOrigin = publicOriginFromEnvironment()
  const certificatePath = process.env.HTTPS_CERT_FILE?.trim()
  const keyPath = process.env.HTTPS_KEY_FILE?.trim()
  if (Boolean(certificatePath) !== Boolean(keyPath)) {
    throw new Error('HTTPS_CERT_FILE dan HTTPS_KEY_FILE harus dikonfigurasi bersama.')
  }

  await stat(resolve(distDirectory, 'index.html')).catch(() => {
    throw new Error('Build aplikasi tidak ditemukan. Jalankan npm run build terlebih dahulu.')
  })

  const listener = (request: IncomingMessage, response: ServerResponse) => {
    void handleRequest(request, response).catch((error: unknown) => {
      console.error('[server]', error)
      if (!response.headersSent) sendJson(response, 500, { error: 'internal_server_error' })
      else response.end()
    })
  }

  const server = certificatePath && keyPath
    ? createHttpsServer({
        cert: await readFile(resolve(projectRoot, certificatePath)),
        key: await readFile(resolve(projectRoot, keyPath)),
      }, listener)
    : createHttpServer(listener)

  const requestTimeoutMs = positiveInteger(
    process.env.HTTP_REQUEST_TIMEOUT_MS,
    DEFAULT_HTTP_REQUEST_TIMEOUT_MS,
  )
  server.requestTimeout = requestTimeoutMs
  server.headersTimeout = Math.min(10_000, requestTimeoutMs)
  server.keepAliveTimeout = 5_000
  server.maxConnections = positiveInteger(
    process.env.MAX_SERVER_CONNECTIONS,
    DEFAULT_MAX_SERVER_CONNECTIONS,
  )

  await new Promise<void>((resolveListen, rejectListen) => {
    const handleListenError = (error: Error) => rejectListen(error)
    server.once('error', handleListenError)
    server.listen(port, host, () => {
      server.off('error', handleListenError)
      resolveListen()
    })
  })
  const protocol = certificatePath ? 'https' : 'http'
  console.log(`TOBFest Photobooth listening on ${protocol}://${host}:${port}`)
  if (publicOrigin) console.log(`Public origin: ${publicOrigin}`)
  console.log(`Printer queue: ${process.env.PRINTER_NAME?.trim() || '(belum dikonfigurasi)'}`)

  server.on('error', (error) => console.error('[server]', error))

  const shutdown = (signal: string) => {
    console.log(`Menerima ${signal}, menutup server…`)
    server.close((error) => {
      if (error) {
        console.error(error)
        process.exitCode = 1
      }
    })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
