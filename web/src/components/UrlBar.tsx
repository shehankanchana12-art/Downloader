'use client'

import { ClipboardPaste, Link2, Loader2, Search, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { forwardRef, useRef } from 'react'

import { cn } from '@/lib/utils'

interface UrlBarProps {
  value: string
  loading: boolean
  canSubmit: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onPasteFromClipboard: () => void
  onPasteText: (text: string) => void
  onClear: () => void
}

export const UrlBar = forwardRef<HTMLInputElement, UrlBarProps>(function UrlBar(
  { value, loading, canSubmit, onChange, onSubmit, onPasteFromClipboard, onPasteText, onClear },
  forwardedRef
) {
  const localRef = useRef<HTMLInputElement | null>(null)

  const setRefs = (node: HTMLInputElement | null) => {
    localRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <div className="group relative rounded-2xl bg-gradient-to-b from-white/10 to-white/[0.03] p-[1px] shadow-glow transition-colors focus-within:from-accent-500/60 focus-within:to-accent-500/20">
        <div className="flex flex-col gap-2 rounded-2xl bg-ink-900/95 p-2 backdrop-blur sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5">
            <Link2 className="h-[18px] w-[18px] shrink-0 text-zinc-500" aria-hidden="true" />
            <input
              ref={setRefs}
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onPaste={(event) => {
                const text = event.clipboardData.getData('text')
                if (text) {
                  event.preventDefault()
                  onPasteText(text)
                }
              }}
              placeholder="Paste a video link…"
              aria-label="Video URL"
              className="h-11 w-full min-w-0 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            {value ? (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear the URL"
                className="rounded-full p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2 px-1 sm:px-0">
            <button
              type="button"
              onClick={onPasteFromClipboard}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white sm:flex-none"
            >
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
              Paste
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition sm:flex-none',
                canSubmit
                  ? 'bg-accent-500 text-white shadow-[0_8px_24px_-10px_rgba(109,124,255,0.9)] hover:bg-accent-400'
                  : 'cursor-not-allowed bg-white/[0.06] text-zinc-500'
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              {loading ? 'Checking' : 'Fetch'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
})
