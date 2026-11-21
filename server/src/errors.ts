export class AppError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 400, code = 'bad_request') {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }
}

/**
 * Translates raw yt-dlp stderr into a short, human readable error.
 * We never forward raw extractor output to the browser.
 */
export function mapYtDlpError(stderr: string): AppError {
  const text = stderr.toLowerCase()

  const has = (...needles: string[]) => needles.some((needle) => text.includes(needle))

  if (has('private video', 'this video is private', 'is a private video')) {
    return new AppError(
      'This video is private, so it cannot be downloaded. Try a public link instead.',
      422,
      'private_video'
    )
  }

  if (has('confirm your age', 'age-restricted', 'age restricted', 'inappropriate for some users')) {
    return new AppError(
      'This video is age-restricted and cannot be downloaded without signing in.',
      422,
      'age_restricted'
    )
  }

  if (has('not available in your country', 'geo restricted', 'geo-restricted', 'not available from your location', 'blocked in your country')) {
    return new AppError(
      'This video is geo-blocked and is not available from this server’s location.',
      451,
      'geo_blocked'
    )
  }

  if (has('unsupported url')) {
    return new AppError(
      'That link is not supported. Paste a direct link to a video, not to a profile or homepage.',
      422,
      'unsupported_url'
    )
  }

  if (has('is live', 'live event will begin', 'premieres in', 'live stream')) {
    return new AppError(
      'Live streams and upcoming premieres cannot be downloaded until they have ended.',
      422,
      'live_stream'
    )
  }

  if (has('requested format is not available', 'no video formats found', 'no formats found')) {
    return new AppError(
      'The requested quality is not available for this video. Try another quality.',
      422,
      'format_unavailable'
    )
  }

  if (has('not a bot', 'captcha', 'unusual traffic', 'confirm you’re not a bot', "confirm you're not a bot")) {
    return new AppError(
      'The source site is asking for human verification right now. Please wait a moment and try again.',
      429,
      'bot_check'
    )
  }

  if (has('login required', 'sign in to confirm', 'requires authentication', 'use --cookies', 'cookies-from-browser', 'authentication')) {
    return new AppError(
      'This video requires a signed-in session, which this downloader does not provide.',
      422,
      'login_required'
    )
  }

  if (has('http error 404', '404 not found')) {
    return new AppError(
      'That page was not found (HTTP 404). Check the link and try again.',
      404,
      'not_found'
    )
  }

  if (has('http error 403', '403 forbidden')) {
    return new AppError(
      'The source site refused the download (HTTP 403). It may be blocking this server.',
      422,
      'forbidden'
    )
  }

  if (has('unable to download webpage')) {
    return new AppError(
      'That page could not be loaded. Check the link and try again.',
      502,
      'page_unreachable'
    )
  }

  if (has('video unavailable', 'this video is unavailable', 'has been removed', 'does not exist', 'removed by the uploader', 'content isn’t available', "content isn't available", '410 gone')) {
    return new AppError(
      'This video is unavailable — it may have been removed or made private.',
      404,
      'unavailable'
    )
  }

  if (has('unable to extract', 'failed to extract', 'no suitable extractor', 'extractorerror')) {
    return new AppError(
      'The video could not be read from that page. The site may have changed its layout.',
      502,
      'extraction_failed'
    )
  }

  if (has('getaddrinfo', 'name or service not known', 'timed out', 'connection refused', 'network is unreachable', 'ssl')) {
    return new AppError(
      'The download server could not reach that link. Check the URL and try again.',
      502,
      'network_error'
    )
  }

  return new AppError(
    'The video could not be downloaded. The source may be blocking downloads right now.',
    502,
    'download_failed'
  )
}
