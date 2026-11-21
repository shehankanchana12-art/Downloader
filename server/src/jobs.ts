import { EventEmitter } from 'node:events'
import type { Response } from 'express'

import { config } from './config'

export type JobStage = 'queued' | 'metadata' | 'downloading' | 'merging' | 'converting' | 'ready' | 'error'

export interface JobError {
  code: string
  message: string
}

export interface JobSnapshot {
  id: string
  stage: JobStage
  percent: number
  message: string
  title?: string
  filename?: string
  error?: JobError
  done: boolean
  updatedAt: number
}

export class Job {
  readonly id: string
  private snapshot: JobSnapshot
  private readonly emitter = new EventEmitter()

  constructor(id: string) {
    this.id = id
    this.snapshot = {
      id,
      stage: 'queued',
      percent: 0,
      message: 'Waiting to start',
      done: false,
      updatedAt: Date.now()
    }
  }

  get current(): JobSnapshot {
    return this.snapshot
  }

  update(patch: Partial<Omit<JobSnapshot, 'id' | 'updatedAt'>>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      id: this.id,
      updatedAt: Date.now()
    }
    this.emitter.emit('update', this.snapshot)
  }

  fail(error: JobError): void {
    this.update({ stage: 'error', message: error.message, error, done: true })
  }

  onUpdate(listener: (snapshot: JobSnapshot) => void): void {
    this.emitter.on('update', listener)
  }

  offUpdate(listener: (snapshot: JobSnapshot) => void): void {
    this.emitter.off('update', listener)
  }
}

const jobs = new Map<string, Job>()

/** Idempotently returns the job for an id, creating it on first use. */
export function getOrCreateJob(id: string): Job {
  const existing = jobs.get(id)
  if (existing) return existing
  const job = new Job(id)
  jobs.set(id, job)
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

/**
 * Streams job updates over Server-Sent Events. The latest snapshot is sent
 * immediately so a client that connects after the job started is never blank.
 */
export function streamJob(res: Response, job: Job): void {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let closed = false
  let heartbeat: NodeJS.Timeout | undefined

  const send = (snapshot: JobSnapshot) => {
    if (closed) return
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`)
  }

  const cleanup = () => {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    job.offUpdate(listener)
  }

  const listener = (snapshot: JobSnapshot) => {
    send(snapshot)
    if (snapshot.done) {
      cleanup()
      res.end()
    }
  }

  res.on('close', cleanup)

  heartbeat = setInterval(() => {
    if (closed) return
    res.write(': ping\n\n')
  }, 15_000)

  job.onUpdate(listener)
  send(job.current)

  if (job.current.done) {
    cleanup()
    res.end()
  }
}

// Drop finished / abandoned jobs so the process stays small.
const sweeper = setInterval(() => {
  const cutoff = Date.now() - config.jobTtlMs
  for (const [id, job] of jobs) {
    if (job.current.updatedAt < cutoff) jobs.delete(id)
  }
}, 60_000)
sweeper.unref()
