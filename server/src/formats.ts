import type { RawFormat, RawInfo } from './ytdlp'

export interface VideoFormatOption {
  quality: 'best' | '1080' | '720' | '480' | '360'
  label: string
  height: number | null
  filesize: number | null
  sizeLabel: string | null
}

export interface AudioFormatOption {
  quality: '320' | '128' | 'best'
  format: 'mp3' | 'm4a'
  label: string
  filesize: number | null
  sizeLabel: string | null
}

const HEIGHT_TARGETS = [1080, 720, 480, 360] as const

function sizeOf(format: RawFormat | undefined): number | null {
  if (!format) return null
  const value = format.filesize ?? format.filesize_approx
  return typeof value === 'number' && value > 0 ? value : null
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const decimals = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unit]}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function isVideoFormat(format: RawFormat): boolean {
  return Boolean(format.vcodec && format.vcodec !== 'none' && typeof format.height === 'number' && format.height > 0)
}

function isAudioOnlyFormat(format: RawFormat): boolean {
  const noVideo = !format.vcodec || format.vcodec === 'none'
  return noVideo && Boolean(format.acodec && format.acodec !== 'none')
}

function qualityOfFormat(format: RawFormat): number {
  return (format.tbr ?? format.vbr ?? format.abr ?? 0) as number
}

function pickAudioSize(formats: RawFormat[]): number | null {
  const audio = formats.filter(isAudioOnlyFormat)
  if (!audio.length) return null
  const best = [...audio].sort((a, b) => qualityOfFormat(b) - qualityOfFormat(a))[0]
  return sizeOf(best)
}

function buildVideoOptions(formats: RawFormat[], duration: number | null): VideoFormatOption[] {
  const video = formats.filter(isVideoFormat)
  if (!video.length) {
    // Some direct-file sources expose a single "format" with no height metadata.
    if (formats.length) {
      return [
        {
          quality: 'best',
          label: 'Best available',
          height: null,
          filesize: sizeOf(formats[0]),
          sizeLabel: formatBytes(sizeOf(formats[0]))
        }
      ]
    }
    return []
  }

  const audioSize = pickAudioSize(formats)
  const maxHeight = Math.max(...video.map((format) => format.height as number))
  const options: VideoFormatOption[] = []

  const bestFormat = [...video].sort((a, b) => {
    const heightDiff = (b.height ?? 0) - (a.height ?? 0)
    return heightDiff !== 0 ? heightDiff : qualityOfFormat(b) - qualityOfFormat(a)
  })[0]

  const bestSize = bestFormat ? (sizeOf(bestFormat) ?? null) : null
  const bestTotal = bestSize && audioSize ? bestSize + audioSize : bestSize ?? (duration ? null : null)

  options.push({
    quality: 'best',
    label: 'Best available',
    height: maxHeight,
    filesize: bestTotal,
    sizeLabel: formatBytes(bestTotal)
  })

  for (const target of HEIGHT_TARGETS) {
    if (maxHeight < target) continue

    const candidates = video.filter((format) => (format.height as number) <= target)
    if (!candidates.length) continue

    const chosen = [...candidates].sort((a, b) => {
      const heightDiff = (b.height ?? 0) - (a.height ?? 0)
      return heightDiff !== 0 ? heightDiff : qualityOfFormat(b) - qualityOfFormat(a)
    })[0]

    const videoSize = sizeOf(chosen)
    const total = videoSize && audioSize ? videoSize + audioSize : videoSize
    if (total === bestTotal && target === maxHeight) {
      // Avoid showing a duplicate of "Best available" when the cap is the best.
      continue
    }

    options.push({
      quality: String(target) as VideoFormatOption['quality'],
      label: `${target}p`,
      height: chosen.height ?? target,
      filesize: total ?? null,
      sizeLabel: formatBytes(total)
    })
  }

  return options
}

function estimateAudioSize(duration: number | null, kbps: number): number | null {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return null
  return Math.round((kbps * 1000 * duration) / 8)
}

export function buildFormatOptions(info: RawInfo) {
  const formats = Array.isArray(info.formats) ? info.formats : []
  const duration = typeof info.duration === 'number' ? info.duration : null

  const videoFormats = buildVideoOptions(formats, duration)

  const bestAudioSize = pickAudioSize(formats)
  const mp3_320 = estimateAudioSize(duration, 320)
  const mp3_128 = estimateAudioSize(duration, 128)
  const m4aSize = bestAudioSize ?? estimateAudioSize(duration, 128)

  const audioFormats: AudioFormatOption[] = [
    {
      quality: '320',
      format: 'mp3',
      label: 'MP3 · 320 kbps',
      filesize: mp3_320,
      sizeLabel: formatBytes(mp3_320)
    },
    {
      quality: '128',
      format: 'mp3',
      label: 'MP3 · 128 kbps',
      filesize: mp3_128,
      sizeLabel: formatBytes(mp3_128)
    },
    {
      quality: 'best',
      format: 'm4a',
      label: 'M4A · original audio',
      filesize: m4aSize,
      sizeLabel: formatBytes(m4aSize)
    }
  ]

  return { videoFormats, audioFormats }
}

export function platformFromInfo(info: RawInfo): string {
  const extractor = (info.extractor_key || info.extractor || '').trim()
  if (extractor) return extractor.replace(/_/g, ' ')
  try {
    const host = new URL(info.webpage_url ?? '').hostname.replace(/^www\./, '')
    return host.split('.')[0] ?? 'Web'
  } catch {
    return 'Web'
  }
}
