import { execFile } from 'node:child_process'
import { Router } from 'express'

import { config } from '../config'

export const healthRouter = Router()

interface HealthCache {
  checkedAt: number
  payload: {
    ok: boolean
    ytDlp: string | null
    ffmpeg: string | null
    maxDurationSeconds: number
  }
}

let cache: HealthCache | null = null
const CACHE_MS = 60_000

function runVersion(binary: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binary, args, { timeout: 5_000 }, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(stdout.toString().split(/\r?\n/)[0]?.trim() || null)
    })
  })
}

healthRouter.get('/', async (_req, res) => {
  if (cache && Date.now() - cache.checkedAt < CACHE_MS) {
    res.json(cache.payload)
    return
  }

  const [ytDlp, ffmpeg] = await Promise.all([
    runVersion(config.ytDlpPath, ['--version']),
    runVersion(config.ffmpegPath, ['-version'])
  ])

  const payload = {
    ok: Boolean(ytDlp && ffmpeg),
    ytDlp,
    ffmpeg: ffmpeg ? ffmpeg.replace(/^ffmpeg version\s*/i, '').split(' ')[0] : null,
    maxDurationSeconds: config.maxDurationSeconds
  }

  cache = { checkedAt: Date.now(), payload }
  res.status(payload.ok ? 200 : 503).json(payload)
})
