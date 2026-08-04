import http from 'node:http'
import https from 'node:https'

const port = Number(process.env.PORT ?? 3000)
const secure = Boolean(process.env.HTTPS_CERT_FILE?.trim())
const client = secure ? https : http

const request = client.get({
  hostname: '127.0.0.1',
  port,
  path: '/api/health',
  rejectUnauthorized: false,
  timeout: 12_000,
}, (response) => {
  response.resume()
  process.exit(response.statusCode === 200 ? 0 : 1)
})

request.on('timeout', () => request.destroy(new Error('healthcheck timeout')))
request.on('error', () => process.exit(1))
