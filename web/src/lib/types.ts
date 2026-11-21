export type OutputFormat = 'mp4' | 'mp3' | 'm4a'

export interface VideoFormatOption {
  quality: string
  label: string
  height: number | null
  filesize: number | null
  sizeLabel: string | null
}

export interface AudioFormatOption {
  quality: string
  format: 'mp3' | 'm4a'
  label: string
  filesize: number | null
  sizeLabel: string | null
}

export interface MediaInfo {
  title: string
  thumbnail: string | null
  duration: number | null
  durationLabel: string
  uploader: string | null
  platform: string
  sourceUrl: string
  maxDurationSeconds: number
  videoFormats: VideoFormatOption[]
  audioFormats: AudioFormatOption[]
}

export type JobStage = 'queued' | 'metadata' | 'downloading' | 'merging' | 'converting' | 'ready' | 'error'

export interface JobSnapshot {
  id: string
  stage: JobStage
  percent: number
  message: string
  title?: string
  filename?: string
  error?: { code: string; message: string }
  done: boolean
  updatedAt: number
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string }
}
