import { randomUUID } from 'node:crypto'

import { config } from './config'
import { AppError } from './errors'

export type OutputFormat = 'mp4' | 'mp3' | 'm4a'
export type VideoQuality = 'best' | '1080' | '720' | '480' | '360'
export type AudioQuality = '320' | '128' | 'best'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'instance-data'
])

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => Number(part))
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false

  const [a, b] = octets as [number, number, number, number]
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === '::1' || host === '::') return true
  if (host.startsWith('fe80:')) return true
  if (host.startsWith('fc') || host.startsWith('fd')) return true
  if (host.startsWith('::ffff:') && isPrivateIpv4(host.slice('::ffff:'.length))) return true
  return false
}

/**
 * Validates and normalizes a user supplied URL.
 * Only plain http(s) URLs to public hosts are accepted: this blocks
 * file://, javascript:, credential-in-URL and SSRF attempts against
 * the host machine or private networks.
 */
export function normalizeVideoUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new AppError('A video URL is required.', 400, 'missing_url')
  }

  const raw = input.trim()
  if (raw.length > config.maxUrlLength) {
    throw new AppError('That URL is too long.', 400, 'invalid_url')
  }

  // Control characters would let a value break out of header/log contexts.
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw new AppError('That URL contains invalid characters.', 400, 'invalid_url')
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new AppError('That is not a valid URL. Include the full address, e.g. https://…', 400, 'invalid_url')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Only http and https links are supported.', 400, 'invalid_url')
  }

  if (parsed.username || parsed.password) {
    throw new AppError('URLs containing credentials are not supported.', 400, 'invalid_url')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) {
    throw new AppError('That URL has no hostname.', 400, 'invalid_url')
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    throw new AppError('That URL points to a private network address and cannot be downloaded.', 400, 'invalid_url')
  }

  return parsed.toString()
}

export function parseFormat(input: unknown): OutputFormat {
  const value = String(input ?? '').toLowerCase()
  if (value === 'mp4' || value === 'mp3' || value === 'm4a') return value
  throw new AppError('Format must be one of mp4, mp3 or m4a.', 400, 'invalid_format')
}

export function parseVideoQuality(input: unknown): VideoQuality {
  const value = String(input ?? 'best').toLowerCase()
  if (value === 'best' || value === '1080' || value === '720' || value === '480' || value === '360') {
    return value
  }
  throw new AppError('Quality must be one of best, 1080, 720, 480 or 360.', 400, 'invalid_quality')
}

export function parseQuality(input: unknown, format: OutputFormat): string {
  if (format === 'mp4') return parseVideoQuality(input)

  if (format === 'mp3') {
    const value = String(input ?? '320').toLowerCase()
    if (value === '320' || value === '128') return value
    throw new AppError('MP3 quality must be 320 or 128.', 400, 'invalid_quality')
  }

  const value = String(input ?? 'best').toLowerCase()
  if (value === 'best' || value === '128') return value
  throw new AppError('M4A quality must be best.', 400, 'invalid_quality')
}

const JOB_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

/** Returns a validated job id, generating one when the client did not send one. */
export function parseJobId(input: unknown): string {
  if (input === undefined || input === null || input === '') return randomUUID()
  if (typeof input !== 'string' || !JOB_ID_PATTERN.test(input)) {
    throw new AppError('Invalid job id.', 400, 'invalid_job')
  }
  return input
}

/** Makes a title safe for a Content-Disposition filename on every OS. */
export function sanitizeFilename(title: string | undefined | null): string {
  const fallback = 'video'
  if (!title) return fallback

  const cleaned = title
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
    .trim()

  return cleaned || fallback
}
