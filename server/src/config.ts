import os from 'node:os'
import path from 'node:path'

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function envString(name: string, fallback: string): string {
  const raw = process.env[name]
  return raw && raw.trim() ? raw.trim() : fallback
}

export const config = {
  /** HTTP port for the API (and the built frontend in production). */
  port: envInt('PORT', 4000),
  host: envString('HOST', '0.0.0.0'),

  /** Where temporary downloads live. Always cleaned up after each request. */
  tmpDir: envString('TMP_DIR', os.tmpdir()),

  /** Hard cap on source duration, in seconds (default 60 minutes). */
  maxDurationSeconds: envInt('MAX_DURATION_SECONDS', 60 * 60),
  maxUrlLength: 2048,

  ytDlpPath: envString('YTDLP_PATH', 'yt-dlp'),
  ffmpegPath: envString('FFMPEG_PATH', 'ffmpeg'),

  /** Built Next.js static files (production only). */
  webRoot: envString('WEB_ROOT', path.resolve(__dirname, '..', '..', 'web', 'out')),

  /** Express "trust proxy" setting; enables correct client IPs behind a reverse proxy. */
  trustProxy: process.env.TRUST_PROXY ?? 'loopback',
  corsOrigin: envString('CORS_ORIGIN', '*'),

  metadataTimeoutMs: envInt('METADATA_TIMEOUT_MS', 45_000),
  downloadTimeoutMs: envInt('DOWNLOAD_TIMEOUT_MS', 15 * 60 * 1000),

  rateLimitWindowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: envInt('RATE_LIMIT_MAX', 10),
  progressRateLimitMax: envInt('PROGRESS_RATE_LIMIT_MAX', 120),

  /** How long a job snapshot is kept in memory for late SSE subscribers. */
  jobTtlMs: envInt('JOB_TTL_MS', 15 * 60 * 1000)
} as const
