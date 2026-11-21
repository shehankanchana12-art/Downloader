'use client'

import { ArrowDownToLine, Download, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MediaCard } from '@/components/MediaCard'
import { Notice } from '@/components/Notice'
import { UrlBar } from '@/components/UrlBar'
import { buildDownloadUrl, createJobId, fetchInfo } from '@/lib/api'
import type { JobSnapshot, MediaInfo, OutputFormat } from '@/lib/types'
import { isValidHttpUrl } from '@/lib/utils'

const DEFAULT_QUALITY: Record<OutputFormat, string> = {
  mp4: 'best',
  mp3: '320',
  m4a: 'best'
}

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'X', 'Facebook', 'Vimeo', 'Reddit', '+1,700 more']

export default function HomePage() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [format, setFormat] = useState<OutputFormat>('mp4')
  const [quality, setQuality] = useState('best')
  const [job, setJob] = useState<JobSnapshot | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [saved, setSaved] = useState(false)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const lookupAbortRef = useRef<AbortController | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const closeProgressStream = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
  }, [])

  const removeDownloadFrame = useCallback(() => {
    iframeRef.current?.remove()
    iframeRef.current = null
  }, [])

  const resetDownloadState = useCallback(() => {
    closeProgressStream()
    removeDownloadFrame()
    setJob(null)
    setDownloading(false)
    setSaved(false)
  }, [closeProgressStream, removeDownloadFrame])

  useEffect(() => {
    return () => {
      lookupAbortRef.current?.abort()
      eventSourceRef.current?.close()
      iframeRef.current?.remove()
    }
  }, [])

  const lookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      resetDownloadState()
      setNotice(null)
      setError(null)

      if (!trimmed) {
        setInfo(null)
        return
      }

      if (!isValidHttpUrl(trimmed)) {
        setInfo(null)
        setError('That doesn’t look like a link. Paste a full URL starting with http:// or https://.')
        return
      }

      lookupAbortRef.current?.abort()
      const controller = new AbortController()
      lookupAbortRef.current = controller

      setLoading(true)
      setInfo(null)

      try {
        const result = await fetchInfo(trimmed, controller.signal)
        if (controller.signal.aborted) return
        setInfo(result)
        setUrl(trimmed)
        setFormat('mp4')
        setQuality('best')
      } catch (caught) {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : 'Something went wrong while reading that link.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [resetDownloadState]
  )

  const handleChange = (value: string) => {
    setUrl(value)
    setError(null)
    setNotice(null)
    if (!value.trim()) {
      setInfo(null)
      resetDownloadState()
    }
  }

  const handlePasteText = (text: string) => {
    const cleaned = text.trim()
    setUrl(cleaned)
    void lookup(cleaned)
  }

  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        throw new Error('unsupported')
      }
      const text = (await navigator.clipboard.readText()).trim()
      if (!text) {
        setNotice('Your clipboard is empty. Copy a video link first.')
        return
      }
      setUrl(text)
      await lookup(text)
    } catch {
      setNotice('Clipboard access was blocked by your browser. Press Ctrl/Cmd + V in the field instead.')
      inputRef.current?.focus()
    }
  }

  const handleClear = () => {
    lookupAbortRef.current?.abort()
    setUrl('')
    setInfo(null)
    setError(null)
    setNotice(null)
    setLoading(false)
    resetDownloadState()
    inputRef.current?.focus()
  }

  const handleFormatChange = (next: OutputFormat) => {
    setFormat(next)
    setQuality(DEFAULT_QUALITY[next])
    setSaved(false)
    setJob(null)
  }

  const handleDownload = () => {
    if (!info || downloading) return

    resetDownloadState()
    setError(null)
    setDownloading(true)

    const jobId = createJobId()
    const stream = new EventSource(`/api/progress/${jobId}`)
    eventSourceRef.current = stream

    stream.onmessage = (event) => {
      let snapshot: JobSnapshot
      try {
        snapshot = JSON.parse(event.data) as JobSnapshot
      } catch {
        return
      }

      setJob(snapshot)

      if (snapshot.stage === 'error') {
        setError(snapshot.error?.message ?? 'The download failed. Please try again.')
        setDownloading(false)
        stream.close()
      } else if (snapshot.stage === 'ready') {
        setDownloading(false)
        setSaved(true)
        stream.close()
      }
    }

    // If the stream drops before finishing, keep the UI honest instead of spinning forever.
    stream.onerror = () => {
      if (stream.readyState === EventSource.CLOSED) {
        setDownloading(false)
      }
    }

    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.title = 'File download'
    frame.src = buildDownloadUrl({
      url: info.sourceUrl || url.trim(),
      format,
      quality,
      jobId
    })
    document.body.appendChild(frame)
    iframeRef.current = frame
  }

  const canSubmit = url.trim().length > 0 && !loading

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-18rem] -z-10 h-[34rem] w-[56rem] -translate-x-1/2 rounded-full bg-accent-500/20 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-12rem] top-[22rem] -z-10 h-[24rem] w-[24rem] rounded-full bg-cyan-400/10 blur-[120px]"
      />

      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 shadow-[0_10px_24px_-12px_rgba(109,124,255,0.9)]">
            <ArrowDownToLine className="h-[18px] w-[18px] text-white" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">Clipfetch</span>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-zinc-400 sm:inline-flex">
          <ShieldCheck className="h-3 w-3 text-emerald-400" aria-hidden="true" />
          No ads · No tracking
        </span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-20">
        <section className="pt-8 text-center sm:pt-14">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-zinc-400">
            <Sparkles className="h-3 w-3 text-accent-300" aria-hidden="true" />
            Video &amp; audio in one click
          </span>

          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
            Download any video.
            <br />
            <span className="bg-gradient-to-r from-accent-300 via-accent-400 to-cyan-300 bg-clip-text text-transparent">
              Keep it forever.
            </span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-balance text-sm leading-relaxed text-zinc-400 sm:text-[15px]">
            Paste a link and save MP4 video or MP3 audio in your preferred quality. Works with YouTube, TikTok,
            Instagram, X, Facebook, Vimeo, Reddit and 1,700+ other sites.
          </p>

          <div className="mt-7 text-left">
            <UrlBar
              ref={inputRef}
              value={url}
              loading={loading}
              canSubmit={canSubmit}
              onChange={handleChange}
              onSubmit={() => void lookup(url)}
              onPasteFromClipboard={() => void handlePasteFromClipboard()}
              onPasteText={handlePasteText}
              onClear={handleClear}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {PLATFORMS.map((platform) => (
              <span
                key={platform}
                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] text-zinc-500"
              >
                {platform}
              </span>
            ))}
          </div>

          <div className="mt-4 space-y-2.5">
            {notice ? <Notice tone="info" message={notice} onDismiss={() => setNotice(null)} /> : null}
            {error ? <Notice tone="error" message={error} onDismiss={() => setError(null)} /> : null}
          </div>
        </section>

        {loading ? (
          <div className="mt-8 animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-ink-850/80">
            <div className="flex flex-col gap-4 p-4 sm:flex-row">
              <div className="aspect-video w-full rounded-xl bg-white/[0.05] sm:w-[260px]" />
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 w-3/4 rounded bg-white/[0.07]" />
                <div className="h-3 w-1/3 rounded bg-white/[0.05]" />
                <div className="mt-6 h-16 rounded-lg bg-white/[0.04]" />
                <div className="h-11 rounded-xl bg-white/[0.06]" />
              </div>
            </div>
          </div>
        ) : null}

        {info && !loading ? (
          <div className="mt-8">
            <MediaCard
              info={info}
              format={format}
              quality={quality}
              downloading={downloading}
              saved={saved}
              job={job}
              onFormatChange={handleFormatChange}
              onQualityChange={setQuality}
              onDownload={handleDownload}
            />
          </div>
        ) : null}

        <section className="mt-14 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Zap,
              title: 'Fast extraction',
              body: 'yt-dlp pulls the best stream the source offers, then FFmpeg merges it cleanly.'
            },
            {
              icon: ShieldCheck,
              title: 'Nothing stored',
              body: 'Files live in a temporary folder and are deleted the moment your download ends.'
            },
            {
              icon: Download,
              title: 'Your format',
              body: 'Choose up to 1080p MP4, or extract MP3 at 320 kbps and M4A audio.'
            }
          ].map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <Icon className="h-4 w-4 text-accent-300" aria-hidden="true" />
                <h3 className="mt-2.5 text-sm font-medium text-zinc-200">{feature.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{feature.body}</p>
              </div>
            )
          })}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl border-t border-white/[0.06] px-5 py-6 text-center text-[11px] text-zinc-600">
        Clipfetch is self-hosted and powered by yt-dlp + FFmpeg. Download only content you have the rights to.
      </footer>
    </div>
  )
}
