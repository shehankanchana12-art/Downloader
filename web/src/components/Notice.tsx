'use client'

import { AlertTriangle, Info, X } from 'lucide-react'

interface NoticeProps {
  tone?: 'error' | 'info'
  message: string
  onDismiss?: () => void
}

export function Notice({ tone = 'error', message, onDismiss }: NoticeProps) {
  const isError = tone === 'error'
  const Icon = isError ? AlertTriangle : Info

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={
        isError
          ? 'flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200'
          : 'flex items-start gap-3 rounded-xl border border-accent-500/25 bg-accent-500/10 px-4 py-3 text-sm text-accent-300'
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-relaxed">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="rounded p-0.5 opacity-60 transition hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
