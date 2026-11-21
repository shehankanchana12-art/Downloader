'use client'

import { CheckCircle2, Loader2 } from 'lucide-react'

import type { JobSnapshot } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ProgressPanelProps {
  job: JobSnapshot | null
  saved: boolean
}

const STAGE_LABEL: Record<JobSnapshot['stage'], string> = {
  queued: 'Queued',
  metadata: 'Fetching metadata',
  downloading: 'Downloading',
  merging: 'Merging with FFmpeg',
  converting: 'Processing audio',
  ready: 'Ready',
  error: 'Failed'
}

export function ProgressPanel({ job, saved }: ProgressPanelProps) {
  if (!job && !saved) return null
  if (job?.stage === 'error') return null

  const percent = Math.round(Math.min(100, Math.max(0, job?.percent ?? 100)))
  const ready = saved || job?.stage === 'ready'

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-zinc-300">
          {ready ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-accent-400" aria-hidden="true" />
          )}
          {ready ? 'Saved to your device' : STAGE_LABEL[job?.stage ?? 'queued']}
        </span>
        <span className="font-mono tabular-nums text-zinc-400">{ready ? '100%' : `${percent}%`}</span>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ready ? 100 : percent}
        aria-label="Download progress"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-out',
            ready ? 'bg-emerald-400' : 'bg-gradient-to-r from-accent-500 to-accent-300'
          )}
          style={{ width: `${ready ? 100 : Math.max(percent, 3)}%` }}
        />
      </div>

      <p className="mt-2.5 truncate text-xs text-zinc-500">
        {ready
          ? 'The file download has started. Check your browser’s downloads.'
          : job?.message ?? 'Preparing your download…'}
      </p>
    </div>
  )
}
