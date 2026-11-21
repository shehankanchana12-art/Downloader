import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { config } from './config'
import { AppError, mapYtDlpError } from './errors'

export interface RawFormat {
  format_id?: string
  ext?: string
  height?: number | null
  width?: number | null
  vcodec?: string
  acodec?: string
  filesize?: number | null
  filesize_approx?: number | null
  tbr?: number | null
  vbr?: number | null
  abr?: number | null
  format_note?: string
}

export interface RawInfo {
  id?: string
  title?: string
  thumbnail?: string
  thumbnails?: { url?: string; preference?: number }[]
  duration?: number | null
  uploader?: string
  channel?: string
  uploader_id?: string
  extractor?: string
  extractor_key?: string
  webpage_url?: string
  original_url?: string
  is_live?: boolean
  live_status?: string
  formats?: RawFormat[]
}

interface RunOptions {
  timeoutMs?: number
  signal?: AbortSignal
  onLine?: (line: string) => void
  /** When false only stderr is buffered (used for downloads). */
  collectStdout?: boolean
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

const MAX_STDOUT_BYTES = 32 * 1024 * 1024
const MAX_STDERR_BYTES = 256 * 1024

/**
 * yt-dlp treats `--ffmpeg-location` as a filesystem path, so a bare binary name
 * such as the default "ffmpeg" makes it report "ffprobe and ffmpeg not found".
 * Only pass the flag when we really have a path; otherwise let yt-dlp use PATH.
 */
function ffmpegLocationArgs(): string[] {
  const location = config.ffmpegPath.trim()
  const looksLikePath = path.isAbsolute(location) || location.includes('/') || location.includes('\\')
  return looksLikePath ? ['--ffmpeg-location', location] : []
}

function baseArgs(): string[] {
  return [
    '--no-warnings',
    '--no-playlist',
    '--no-cache-dir',
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    ...ffmpegLocationArgs()
  ]
}

/**
 * Runs yt-dlp with an argument array. Arguments are never shell-interpolated,
 * so a URL such as `; rm -rf /` is passed to yt-dlp as a single literal string.
 */
function runYtDlp(args: string[], options: RunOptions = {}): Promise<RunResult> {
  const { timeoutMs = config.metadataTimeoutMs, signal, onLine, collectStdout = true } = options

  return new Promise<RunResult>((resolve, reject) => {
    let child
    try {
      child = spawn(config.ytDlpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      })
    } catch (error) {
      reject(new AppError('The media engine could not be started on this server.', 503, 'engine_unavailable'))
      return
    }

    let settled = false
    let timedOut = false
    let stdout = ''
    let stderr = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fn()
    }

    const fail = (error: AppError) => finish(() => reject(error))

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    const onAbort = () => {
      child.kill('SIGKILL')
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        fail(
          new AppError(
            'yt-dlp is not installed on the server. Install it (pip install yt-dlp) or run the Docker image.',
            503,
            'engine_unavailable'
          )
        )
        return
      }
      fail(new AppError('The media engine could not be started on this server.', 503, 'engine_unavailable'))
    })

    const handleLine = (line: string) => {
      if (onLine) {
        try {
          onLine(line)
        } catch {
          // Progress handlers must never break the download.
        }
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (collectStdout) {
        stdout += chunk
        if (stdout.length > MAX_STDOUT_BYTES) {
          child.kill('SIGKILL')
          fail(new AppError('The response from the source was too large to process.', 502, 'response_too_large'))
          return
        }
      }
      if (onLine) {
        stdoutBuffer += chunk
        const parts = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = parts.pop() ?? ''
        for (const line of parts) handleLine(line)
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < MAX_STDERR_BYTES) stderr += chunk
      if (onLine) {
        stderrBuffer += chunk
        const parts = stderrBuffer.split(/\r?\n/)
        stderrBuffer = parts.pop() ?? ''
        for (const line of parts) handleLine(line)
      }
    })

    child.on('close', (code) => {
      if (stdoutBuffer) handleLine(stdoutBuffer)
      if (stderrBuffer) handleLine(stderrBuffer)

      if (timedOut) {
        fail(new AppError('Reading that video took too long. Try again or use a smaller video.', 504, 'timeout'))
        return
      }
      if (signal?.aborted) {
        fail(new AppError('The request was cancelled.', 499, 'cancelled'))
        return
      }
      finish(() => resolve({ code, stdout, stderr }))
    })
  })
}

export async function fetchMetadata(url: string, signal?: AbortSignal): Promise<RawInfo> {
  const args = [...baseArgs(), '--dump-single-json', '--skip-download', url]
  const result = await runYtDlp(args, { signal, collectStdout: true })

  if (result.code !== 0) {
    throw mapYtDlpError(result.stderr)
  }

  const payload = result.stdout.trim()
  if (!payload) {
    throw new AppError('No video information was returned for that link.', 502, 'no_metadata')
  }

  let parsed: RawInfo
  try {
    parsed = JSON.parse(payload) as RawInfo
  } catch {
    throw new AppError('The video information could not be read from that page.', 502, 'bad_metadata')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new AppError('The video information could not be read from that page.', 502, 'bad_metadata')
  }

  return parsed
}

export interface DownloadProgress {
  percent: number
  stage?: 'downloading' | 'merging' | 'converting'
  message?: string
}

interface DownloadOptions {
  url: string
  format: 'mp4' | 'mp3' | 'm4a'
  quality: string
  outputPath: string
  signal?: AbortSignal
  onProgress: (progress: DownloadProgress) => void
}

function videoFormatExpression(quality: string): string {
  const height = quality === 'best' ? null : Number.parseInt(quality, 10)
  const cap = height && Number.isFinite(height) ? `[height<=${height}]` : ''

  // Prefer H.264 + AAC so FFmpeg can always mux into an MP4 without re-encoding.
  return [
    `bv*${cap}[vcodec^=avc1]+ba[ext=m4a]`,
    `bv*${cap}+ba`,
    `b${cap}`,
    'b'
  ].join('/')
}

function buildDownloadArgs(options: DownloadOptions): string[] {
  const args = [...baseArgs(), '--newline', '--progress', '--progress-delta', '0.5', '--no-part']

  if (options.format === 'mp4') {
    args.push('-f', videoFormatExpression(options.quality))
    args.push('--merge-output-format', 'mp4')
  } else if (options.format === 'mp3') {
    args.push('-f', 'bestaudio/best')
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', options.quality === '128' ? '128K' : '320K')
  } else {
    args.push('-f', 'bestaudio/best')
    args.push('-x', '--audio-format', 'm4a')
    if (options.quality === '128') args.push('--audio-quality', '128K')
  }

  args.push('-o', options.outputPath, options.url)
  return args
}

const PERCENT_PATTERN = /\[download\]\s+(\d{1,3}(?:\.\d+)?)%/

export async function downloadToFile(options: DownloadOptions): Promise<void> {
  const args = buildDownloadArgs(options)

  const handleLine = (line: string) => {
    if (line.includes('[Merger]')) {
      options.onProgress({ percent: 96, stage: 'merging', message: 'Merging video + audio with FFmpeg' })
      return
    }
    if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
      options.onProgress({ percent: 96, stage: 'converting', message: 'Processing audio with FFmpeg' })
      return
    }

    const match = PERCENT_PATTERN.exec(line)
    if (match) {
      const percent = Number.parseFloat(match[1])
      if (Number.isFinite(percent)) {
        options.onProgress({
          percent: Math.min(percent, 95),
          stage: 'downloading',
          message: options.format === 'mp4' ? 'Downloading video' : 'Downloading audio'
        })
      }
    }
  }

  const result = await runYtDlp(args, {
    timeoutMs: config.downloadTimeoutMs,
    signal: options.signal,
    onLine: handleLine,
    collectStdout: false
  })

  if (result.code !== 0) {
    throw mapYtDlpError(result.stderr)
  }

  if (!fs.existsSync(options.outputPath)) {
    throw new AppError('The download finished without producing a file. Try a different quality.', 502, 'no_output')
  }
}

/** Removes a final file plus any `.part` / fragment leftovers for a job. */
export async function cleanupArtifacts(prefix: string): Promise<void> {
  try {
    const entries = await fs.promises.readdir(config.tmpDir)
    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => fs.promises.rm(path.join(config.tmpDir, entry), { force: true, recursive: true }))
    )
  } catch {
    // Best effort: a failed cleanup must never fail the request.
  }
}
