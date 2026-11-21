import type { ApiErrorBody, MediaInfo, OutputFormat } from './types'

/**
 * Same-origin API paths. In development the Next dev server proxies /api to
 * the Express server (see next.config.mjs), so no base URL is needed.
 */
async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    if (body?.error?.message) return body.error.message
  } catch {
    // Fall through to the generic message.
  }
  if (response.status === 429) return 'Too many requests. Please wait a minute and try again.'
  return 'Something went wrong. Please try again.'
}

export async function fetchInfo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  let response: Response
  try {
    response = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new Error('Could not reach the download server. Check your connection and try again.')
  }

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return (await response.json()) as MediaInfo
}

export function buildDownloadUrl(params: {
  url: string
  format: OutputFormat
  quality: string
  jobId: string
}): string {
  const query = new URLSearchParams({
    url: params.url,
    format: params.format,
    quality: params.quality,
    jobId: params.jobId
  })
  return `/api/download?${query.toString()}`
}

/** crypto.randomUUID needs a secure context; fall back for plain-http LAN dev. */
export function createJobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
