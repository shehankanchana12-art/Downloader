# Clipfetch

A self-hosted video and audio downloader for 1,700+ sites (YouTube, TikTok, Instagram, X/Twitter, Facebook, Vimeo, Reddit, and anything else [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports). Paste a link, pick MP4 or MP3/M4A, download. No ads, no popups, no accounts, no tracking.

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS + Lucide icons — exported as static files.
- **Backend:** Node.js + Express + TypeScript. `yt-dlp` for extraction, `FFmpeg` for merging DASH streams and extracting audio.
- **Progress:** Server-Sent Events driven by `yt-dlp` stdout percentages.
- **Cleanup:** Every download writes one temp file under `TMP_DIR` and is deleted when the response finishes, closes or errors.
- **Limits:** 60-minute source cap and 10 requests/minute per IP by default.

## Project structure

```
.
├── Dockerfile                  # Node 20 + Python + yt-dlp + FFmpeg, single container
├── docker-compose.yml
├── package.json                # convenience scripts (dev/build/start)
├── server/                     # Express API
│   ├── src/
│   │   ├── index.ts            # app wiring, rate limits, static frontend, error handler
│   │   ├── config.ts           # env configuration
│   │   ├── errors.ts           # AppError + yt-dlp stderr -> friendly message
│   │   ├── validate.ts         # URL/format/quality/job-id validation + SSRF guard
│   │   ├── formats.ts          # normalizes yt-dlp formats into clean options
│   │   ├── ytdlp.ts            # spawn() runner, metadata, download, cleanup
│   │   ├── jobs.ts             # in-memory job registry + SSE streaming
│   │   └── routes/             # info, download, progress, health
│   └── tsconfig.json
└── web/                        # Next.js frontend
    ├── next.config.mjs         # static export in prod, /api proxy in dev
    ├── src/app/                # layout, page, global styles, favicon
    ├── src/components/         # UrlBar, MediaCard, ProgressPanel, Notice
    └── src/lib/                # typed API client + shared types
```

## Quick start with Docker (recommended)

```bash
docker compose up --build
# open http://localhost:4000
```

The image installs Python, `yt-dlp`, FFmpeg and Node.js, builds the frontend, and serves everything from a single Express process. `/tmp` is a 2 GB tmpfs, so temporary downloads never touch the host disk.

## Local development

Requirements: Node.js 20+, Python 3.10+, `yt-dlp` and `ffmpeg` on your `PATH`.

```bash
# install the tools (Debian/Ubuntu example)
sudo apt-get install -y ffmpeg python3-pip
pipx install yt-dlp        # or: pip install --user -U yt-dlp

# install dependencies
npm run install:all

# start API (:4000) + Next dev server (:3000) together
npm run dev
# open http://localhost:3000
```

`next.config.mjs` proxies `/api/*` to `http://127.0.0.1:4000` in development, so the browser only talks to one origin (which keeps SSE and downloads simple). Set `API_PROXY_TARGET` if the API runs elsewhere.

### Production build without Docker

```bash
npm run install:all
npm run build          # web -> web/out (static export), server -> server/dist
npm start              # Express serves the API + static frontend on :4000
```

## API

### `POST /api/info`

```json
{ "url": "https://www.youtube.com/watch?v=…" }
```

Returns title, thumbnail, duration, uploader, platform, and normalized formats:

```json
{
  "title": "…",
  "thumbnail": "https://…",
  "duration": 213,
  "durationLabel": "3:33",
  "uploader": "…",
  "platform": "Youtube",
  "sourceUrl": "https://…",
  "maxDurationSeconds": 3600,
  "videoFormats": [
    { "quality": "best", "label": "Best available", "height": 1080, "filesize": 58234112, "sizeLabel": "55.5 MB" },
    { "quality": "720", "label": "720p", "height": 720, "filesize": 21000000, "sizeLabel": "20.0 MB" }
  ],
  "audioFormats": [
    { "quality": "320", "format": "mp3", "label": "MP3 · 320 kbps", "filesize": 8520000, "sizeLabel": "8.1 MB" },
    { "quality": "128", "format": "mp3", "label": "MP3 · 128 kbps", "filesize": 3408000, "sizeLabel": "3.3 MB" },
    { "quality": "best", "format": "m4a", "label": "M4A · original audio", "filesize": 3410000, "sizeLabel": "3.3 MB" }
  ]
}
```

### `GET /api/download?url=…&format=mp4&quality=1080&jobId=…`

- `format`: `mp4` | `mp3` | `m4a`
- `quality`: `best` | `1080` | `720` | `480` | `360` (MP4), `320` | `128` (MP3), `best` (M4A)
- `jobId`: optional; the frontend supplies a UUID so it can follow progress. One is generated if omitted.

Responds with the media file as an attachment. Errors are JSON: `{ "error": { "code": "…", "message": "…" } }`.

### `GET /api/progress/:jobId` (SSE)

```
data: {"id":"…","stage":"downloading","percent":42.7,"message":"Downloading video","done":false,…}
```

Stages: `queued` → `metadata` → `downloading` → `merging` / `converting` → `ready`, or `error`. A late subscriber receives the current snapshot immediately.

### `GET /api/health`

Reports whether `yt-dlp` and FFmpeg are available, plus the duration limit.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `TMP_DIR` | OS temp dir | Where downloads are written (deleted after each request) |
| `MAX_DURATION_SECONDS` | `3600` | Reject longer sources |
| `RATE_LIMIT_MAX` | `10` | Requests per IP per window on `/api/info` + `/api/download` |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `PROGRESS_RATE_LIMIT_MAX` | `120` | SSE connections per IP per window |
| `METADATA_TIMEOUT_MS` | `45000` | Timeout for the metadata probe |
| `DOWNLOAD_TIMEOUT_MS` | `900000` | Hard cap for one download |
| `YTDLP_PATH` / `FFMPEG_PATH` | `yt-dlp` / `ffmpeg` | Binary paths |
| `WEB_ROOT` | `web/out` | Static frontend directory |
| `TRUST_PROXY` | `loopback` | Express `trust proxy` (set to `1` behind one reverse proxy) |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `JOB_TTL_MS` | `900000` | How long job snapshots are kept in memory |

## Security notes

- URLs are parsed and validated; only `http`/`https` to public hosts are accepted. `file://`, credentials-in-URL, `localhost`, link-local and private/ULA addresses are rejected (SSRF guard).
- `yt-dlp` and FFmpeg are invoked with `spawn()` and an **argument array** — never a shell string — so URLs cannot inject commands.
- Titles used in `Content-Disposition` are sanitized and RFC 5987 encoded.
- Uploaded nothing, stored nothing: only the temporary download exists, and it is removed on finish, close or error.
- Run behind a reverse proxy with HTTPS in production, and set `TRUST_PROXY` correctly so rate limiting sees real client IPs.

## Legal

Download only content you own or are permitted to download. Respect each platform's terms of service and local copyright law.
