import { Router } from 'express'

import { config } from '../config'
import { AppError } from '../errors'
import { buildFormatOptions, formatDuration, platformFromInfo } from '../formats'
import { normalizeVideoUrl } from '../validate'
import { fetchMetadata, type RawInfo } from '../ytdlp'

export const infoRouter = Router()

export function assertDownloadable(info: RawInfo): void {
  if (info.is_live || info.live_status === 'is_live') {
    throw new AppError('Live streams cannot be downloaded. Try again after the stream has ended.', 422, 'live_stream')
  }

  if (typeof info.duration === 'number' && info.duration > config.maxDurationSeconds) {
    throw new AppError(
      `That video is ${formatDuration(info.duration)} long. The limit is ${Math.round(config.maxDurationSeconds / 60)} minutes.`,
      413,
      'duration_limit'
    )
  }
}

function thumbnailOf(info: RawInfo): string | null {
  const direct = info.thumbnail
  if (direct) return direct.replace(/^http:\/\//i, 'https://')

  const thumbs = Array.isArray(info.thumbnails) ? info.thumbnails : []
  const best = [...thumbs]
    .filter((thumb) => typeof thumb.url === 'string' && thumb.url)
    .sort((a, b) => (b.preference ?? 0) - (a.preference ?? 0))[0]

  return best?.url ? best.url.replace(/^http:\/\//i, 'https://') : null
}

infoRouter.post('/', async (req, res, next) => {
  try {
    const url = normalizeVideoUrl(req.body?.url)
    const info = await fetchMetadata(url)
    assertDownloadable(info)

    if (!info.title) {
      throw new AppError('That link does not look like a video page.', 422, 'unsupported_url')
    }

    const { videoFormats, audioFormats } = buildFormatOptions(info)
    if (!videoFormats.length && !audioFormats.length) {
      throw new AppError('No downloadable formats were found for that link.', 422, 'no_formats')
    }

    const duration = typeof info.duration === 'number' && info.duration > 0 ? info.duration : null

    res.setHeader('Cache-Control', 'no-store')
    res.json({
      title: info.title,
      thumbnail: thumbnailOf(info),
      duration,
      durationLabel: formatDuration(duration),
      uploader: info.uploader || info.channel || info.uploader_id || null,
      platform: platformFromInfo(info),
      sourceUrl: info.webpage_url || url,
      maxDurationSeconds: config.maxDurationSeconds,
      videoFormats,
      audioFormats
    })
  } catch (error) {
    next(error)
  }
})

