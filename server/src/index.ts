import fs from 'node:fs'
import path from 'node:path'

import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'

import { config } from './config'
import { AppError } from './errors'
import { downloadRouter } from './routes/download'
import { healthRouter } from './routes/health'
import { infoRouter } from './routes/info'
import { progressRouter } from './routes/progress'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', config.trustProxy)

app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST'],
    maxAge: 600
  })
)

app.use(express.json({ limit: '16kb' }))

const windowMinutes = Math.max(1, Math.round(config.rateLimitWindowMs / 60_000))

/** 10 requests/minute per IP on the expensive extraction endpoints. */
const extractionLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'rate_limited',
        message: `Too many requests. You can make ${config.rateLimitMax} requests every ${windowMinutes} minute${
          windowMinutes === 1 ? '' : 's'
        }. Please wait and try again.`
      }
    })
  }
})

const progressLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.progressRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many progress connections. Please wait a moment.' } })
  }
})

app.use('/api/info', extractionLimiter, infoRouter)
app.use('/api/download', extractionLimiter, downloadRouter)
app.use('/api/progress', progressLimiter, progressRouter)
app.use('/api/health', healthRouter)

app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Unknown API endpoint.' } })
})

// Production: serve the statically exported Next.js app from the same origin.
const hasWebBuild = fs.existsSync(path.join(config.webRoot, 'index.html'))
if (hasWebBuild) {
  app.use(
    express.static(config.webRoot, {
      index: 'index.html',
      extensions: ['html'],
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
      }
    })
  )

  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    res.sendFile(path.join(config.webRoot, 'index.html'), (error) => {
      if (error) next(error)
    })
  })
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('Clipfetch API is running. Build the frontend (npm run build) or use the Next.js dev server on port 3000.')
  })
}

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } })
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    res.destroy()
    return
  }

  if (error instanceof AppError) {
    if (error.status >= 500) console.error(`[error] ${error.code}: ${error.message}`)
    res.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }

  const bodyError = error as { type?: string; status?: number }
  if (bodyError?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'The request body must be valid JSON.' } })
    return
  }

  console.error('[error] unhandled', error)
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong on the server.' } })
})

const server = app.listen(config.port, config.host, () => {
  console.log(`Clipfetch API listening on http://${config.host}:${config.port}`)
  console.log(`  yt-dlp:  ${config.ytDlpPath}`)
  console.log(`  ffmpeg:  ${config.ffmpegPath}`)
  console.log(`  tmp dir: ${config.tmpDir}`)
  console.log(`  web root: ${hasWebBuild ? config.webRoot : '(not built — dev mode)'}`)
})

function shutdown(signal: string): void {
  console.log(`\n${signal} received, shutting down.`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
