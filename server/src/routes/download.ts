import fs from 'node:fs'
import path from 'node:path'

import { Router, type Response } from 'express'

import { config } from '../config'
import { AppError } from '../errors'
import { getOrCreateJob, type Job } from '../jobs'
import { parseFormat, parseJobId, parseQuality, sanitizeFilename, normalizeVideoUrl, type OutputFormat } from '../validate'
import { cleanupArtifacts, downloadToFile, fetchMetadata } from '../ytdlp'
import { assertDownloadable } from './info'

export const downloadRouter = Router()

const CONTENT_TYPES: Record<OutputFormat, string> = {
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4'
}

/**
 * RFC 6266 / 5987 Content-Disposition so non-ASCII titles survive.
 * The ASCII fallback has all unsafe characters stripped.
 */
function contentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Streams a finished file to the client and deletes it from /tmp when the
 * response finishes, closes early, or the read stream errors.
 */
function streamFileAndCleanup(res: Response, filePath: string, filename: string, contentType: string): void {
  let size: number
  try {
    size = fs.statSync(filePath).size
  } catch {
    throw new AppError('The downloaded file was not found on the server.', 500, 'file_missing')
  }

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', String(size))
  res.setHeader('Content-Disposition', contentDisposition(filename))
  res.setHeader('Cache-Control', 'no-store, no-transform')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  const stream = fs.createReadStream(filePath)
  let deleted = false
  const remove = () => {
    if (deleted) return
    deleted = true
    fs.rm(filePath, { force: true }, () => {
      // Nothing else to do: the file is gone or already removed.
    })
  }

  stream.on('error', () => {
    remove()
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'stream_failed', message: 'The file could not be streamed.' } })
    } else {
      res.destroy()
    }
  })

  stream.on('end', remove)
  res.on('finish', remove)
  res.on('close', () => {
    if (!res.writableEnded) stream.destroy()
    remove()
  })

  stream.pipe(res)
}

downloadRouter.get('/', async (req, res, next) => {
  const controller = new AbortController()
  const abortIfOpen = () => {
    if (!res.writableEnded) controller.abort()
  }
  res.on('close', abortIfOpen)

  let job: Job
  try {
    job = getOrCreateJob(parseJobId(req.query.jobId))
  } catch (error) {
    res.off('close', abortIfOpen)
    next(error)
    return
  }

  const prefix = `dl-${job.id}`
  let outputPath: string | null = null

  try {
    const url = normalizeVideoUrl(req.query.url)
    const format = parseFormat(req.query.format)
    const quality = parseQuality(req.query.quality, format)

    job.update({ stage: 'metadata', percent: 2, message: 'Fetching metadata', done: false })

    const info = await fetchMetadata(url, controller.signal)
    assertDownloadable(info)

    if (!info.title) {
      throw new AppError('That link does not look like a video page.', 422, 'unsupported_url')
    }

    const title = sanitizeFilename(info.title)
    outputPath = path.join(config.tmpDir, `${prefix}.${format}`)

    job.update({
      stage: 'downloading',
      percent: 4,
      message: format === 'mp4' ? 'Downloading video' : 'Downloading audio',
      title
    })

    await downloadToFile({
      url,
      format,
      quality,
      outputPath,
      signal: controller.signal,
      onProgress: (progress) => {
        job.update({
          stage: progress.stage ?? 'downloading',
          percent: Math.max(4, Math.min(97, progress.percent)),
          message: progress.message ?? 'Downloading'
        })
      }
    })

    if (!fs.existsSync(outputPath)) {
      throw new AppError('The download finished without producing a file. Try a different quality.', 502, 'no_output')
    }

    job.update({
      stage: 'ready',
      percent: 100,
      message: 'Ready to save',
      filename: `${title}.${format}`,
      done: true
    })

    // From here the file is owned by the response stream, which deletes it.
    const filePath = outputPath
    outputPath = null
    res.off('close', abortIfOpen)
    streamFileAndCleanup(res, filePath, `${title}.${format}`, CONTENT_TYPES[format])
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError('The video could not be downloaded. Please try again.', 500, 'internal_error')

    job.fail({ code: appError.code, message: appError.message })
    await cleanupArtifacts(prefix)

    res.off('close', abortIfOpen)

    if (controller.signal.aborted && res.destroyed) {
      return
    }
    next(error)
  }
})
