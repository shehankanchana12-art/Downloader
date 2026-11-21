'use client'

import { AudioLines, Clock, Download, Film, Loader2, Music, User } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ProgressPanel } from '@/components/ProgressPanel'
import type { JobSnapshot, MediaInfo, OutputFormat } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MediaCardProps {
  info: MediaInfo
  format: OutputFormat
  quality: string
  downloading: boolean
  saved: boolean
  job: JobSnapshot | null
  onFormatChange: (format: OutputFormat) => void
  onQualityChange: (quality: string) => void
  onDownload: () => void
}

interface QualityOption {
  value: string
  label: string
  meta: string | null
}

const FORMATS: { value: OutputFormat; label: string; hint: string; icon: typeof Film }[] = [
  { value: 'mp4', label: 'MP4', hint: 'Video', icon: Film },
  { value: 'mp3', label: 'MP3', hint: 'Audio', icon: Music },
  { value: 'm4a', label: 'M4A', hint: 'Audio', icon: AudioLines }
]

export function MediaCard({
  info,
  format,
  quality,
  downloading,
  saved,
  job,
  onFormatChange,
  onQualityChange,
  onDownload
}: MediaCardProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false)

  useEffect(() => {
    setThumbnailFailed(false)
  }, [info.thumbnail])

  const qualityOptions: QualityOption[] =
    format === 'mp4'
      ? info.videoFormats.map((option) => ({
          value: option.quality,
          label: option.quality === 'best' ? 'Best' : option.label,
          meta: option.quality === 'best' && option.height ? `${option.height}p` : option.sizeLabel
        }))
      : info.audioFormats
          .filter((option) => option.format === format)
          .map((option) => ({
            value: option.quality,
            label: option.format === 'mp3' ? `${option.quality} kbps` : 'Original',
            meta: option.sizeLabel
          }))

  const downloadLabel = format === 'mp4' ? 'Download video' : 'Download audio'

  return (
    <section className="animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-ink-850/90 shadow-card backdrop-blur">
      <div className="flex flex-col sm:flex-row">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-ink-800 sm:aspect-auto sm:w-[260px]">
          {info.thumbnail && !thumbnailFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
              referrerPolicy="no-referrer"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <div className="flex h-full min-h-[160px] w-full items-center justify-center bg-gradient-to-br from-accent-500/20 via-ink-800 to-ink-850">
              <Film className="h-10 w-10 text-white/20" aria-hidden="true" />
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-3">
            <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-200 ring-1 ring-white/10">
              {info.platform}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[11px] tabular-nums text-zinc-200 ring-1 ring-white/10">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {info.durationLabel}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-5">
          <h2 className="line-clamp-2 text-balance text-base font-semibold leading-snug text-white" title={info.title}>
            {info.title}
          </h2>

          {info.uploader ? (
            <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-zinc-400">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{info.uploader}</span>
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Format</p>
              <div className="grid grid-cols-3 gap-2">
                {FORMATS.map((option) => {
                  const Icon = option.icon
                  const active = format === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onFormatChange(option.value)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition',
                        active
                          ? 'border-accent-500/60 bg-accent-500/15 text-white'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="font-semibold">{option.label}</span>
                      <span className="text-[10px] uppercase tracking-wide opacity-60">{option.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Quality</p>
              <div className="flex flex-wrap gap-2">
                {qualityOptions.map((option) => {
                  const active = quality === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onQualityChange(option.value)}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition',
                        active
                          ? 'border-accent-500/60 bg-accent-500/15 text-white'
                          : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      {option.meta ? <span className="text-[10px] text-zinc-500">{option.meta}</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className={cn(
              'mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
              downloading
                ? 'cursor-progress bg-accent-500/40 text-white/70'
                : 'bg-accent-500 text-white shadow-[0_12px_30px_-14px_rgba(109,124,255,0.95)] hover:bg-accent-400 active:translate-y-px'
            )}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {downloading ? 'Preparing your file…' : downloadLabel}
          </button>

          <ProgressPanel job={job} saved={saved} />
        </div>
      </div>
    </section>
  )
}
