# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server on 0.0.0.0 (share/QR endpoints served by a Vite plugin)
npm run lint       # eslint .
npm run typecheck  # all three TS projects (app+node refs, api, server)
npm run build      # typecheck all projects, then vite build -> dist/ and tsc -> dist-server/
npm run start      # node dist-server/server/local-server.js (requires a prior build)
```

There is no test runner in this repo — verification is `lint` + `typecheck` + manual booth flow.

`VITE_OPERATOR_PIN` (or legacy `APP_LOCK_ENV`) **must** be set at build/dev time; `src/config/env.ts` throws at module load if it is missing, so the app will not boot without it. Put it in `.env.local` for dev. All other env vars (`PRINTER_NAME`, `PRINT_*`, `SHARE_*`, `HTTPS_*`, `PUBLIC_ORIGIN`, …) are read by the Node server at runtime — see `.env.example`.

Docker on Fedora is the primary deployment: `cp .env.example .env && docker compose build && docker compose up -d` (host networking so the container reaches host CUPS on 127.0.0.1:631; `ffmpeg` and `cups-client` come from the runtime image).

## Architecture

React 19 + TypeScript kiosk photobooth (iPad), built as a **modular monolith**. Everything user-facing runs in the browser; the server only prints and hosts short-lived QR shares.

### Module layout

`src/modules/<module>/{domain,application,infrastructure,presentation}` — `app-lock`, `booth`, `camera`, `frames`, `operator`, `sessions`, `sharing`. `src/shared/` holds cross-module utilities (Dexie database, canvas helpers). Presentation never touches Dexie or `fetch` directly; it receives services via props.

`src/bootstrap/app-container.ts` is the single composition root — it instantiates `BoothDatabase`, the Dexie repositories, `FrameService`, `SessionService`, `HttpShareService`, and the app-lock use case, then exports `appContainer`. `BoothApp` takes that container as a prop. Add new dependencies there, not via imports in components.

### Booth flow

`booth-app.tsx` is a screen state machine: `idle → frames → camera → review → processing → result`, plus `operator-lock`/`operator`. The number of photos is derived from the selected frame's slots (`resolveFrameSlots`), never hard-coded. Each capture is a **Live Photo**: a still plus a ~4s MP4 (`captureLivePhoto` records 2s before and 2s after the shutter via `MediaRecorder`).

`finalize()` composes two artifacts in parallel: `composePhotoStrip` (JPEG strip) and `composeLiveTemplate` (canvas `captureStream` + `MediaRecorder` → MP4; failure is tolerated and yields `undefined`). The 4R sheets are composed lazily on the result screen by `composePhotoSheet`, which has two variants: `print` (2mm safe margin + centre cut marks, used for `/api/print` and the on-screen preview) and `download` (two full-bleed strips, no margin or cut marks, used as the photo published to the QR share).

### Canvas geometry (load-bearing constants)

`src/modules/camera/domain/template-layout.ts` defines `TEMPLATE_WIDTH/HEIGHT = 600×1800` (one strip) and `PRINT_WIDTH/HEIGHT = 1200×1800` (4R portrait at 300 DPI = two identical strips side by side with a centre cut mark). Every frame PNG, uploaded or preset, is normalized to the 600×1800 strip canvas; slot coordinates in `templateLayoutOptions` and in operator-defined `customSlots` are in that space. `FrameService.add` validates slots against those bounds (1–6 slots, min 120×90, inside the canvas, radius ≤ half the shorter side). Changing these constants breaks frame layouts, print sizing, and the live template together.

### Storage

Dexie/IndexedDB (`tobfest-photobooth`, tables `frames` and `sessions`) holds frames — including their PNG `Blob` — and sessions with photo data URLs and final blobs. Frames survive offline; presets are seeded by `FrameService.initialize()` and cannot be deleted. Invariant enforced in `FrameService`: at least one frame must stay active.

### Share/QR endpoints — three implementations of one contract

The client (`HttpShareService`) only ever calls `POST /api/shares` (multipart: `sessionId`, `photo`, `live`), `DELETE /api/shares/:id` with an `x-share-token` header, and renders a QR for the returned `downloadUrl` (`/download/:id`). Three separate backends implement that contract and must be kept in sync when it changes:

- `build/local-share-plugin.ts` — Vite dev middleware, in-memory.
- `server/local-share.ts` — production Fedora server, in-memory with TTL/count/byte caps and eviction; remuxes the uploaded MP4 with `ffmpeg -movflags +faststart` (falls back to the original if ffmpeg fails).
- `api/*.ts` + `server/vercel-share.ts` — legacy Vercel Functions backed by private Vercel Blob; `vercel.json` rewrites `/download/:id` and `/api/shares/:id` onto those functions.

MP4 metadata rule: `MediaRecorder.mimeType` carries a codec parameter (`video/mp4;codecs=h264`) that must never reach a stored blob or a `content-type` header — `src/modules/camera/domain/live-photo-media.ts` normalizes it on the client, and all three backends persist `video/mp4` verbatim. Only the Fedora server remuxes, so a live MP4 served in dev or on Vercel is still fragmented (duration reads 0, moov at the end).

Shares are deliberately ephemeral: "Mulai lagi" issues the `DELETE`, TTL (default 24h) is only a safety net, and a Fedora server restart drops everything.

### Printing

`server/local-print.ts` handles `POST /api/print` (raw JPEG/PNG body) and `GET /api/health`. It validates the image signature, writes to a temp file, and shells out to `lp`. Guards worth preserving when editing: `x-print-request-id` idempotency records (so a dropped connection retry cannot queue a second job — the client distinguishes `failed` from `uncertain`), a concurrency cap, command timeouts, temp-file cleanup, and strict `NAME=Value` validation of any env-supplied CUPS options before they reach `lp -o`. Printer name and options can be selected per connection profile via `PRINT_PROFILE` + `PRINT_PRINTER_NAME_<PROFILE>` / `PRINT_CUPS_OPTIONS_<PROFILE>`.

`server/local-server.ts` also serves `dist/` statically, sets a strict CSP and `permissions-policy: camera=(self)`, blocks cross-site mutations on `/api/*`, and optionally terminates HTTPS itself when `HTTPS_CERT_FILE`/`HTTPS_KEY_FILE` are both set (needed for Safari camera access over a LAN IP; otherwise put Caddy/Cloudflare Tunnel in front and set `PUBLIC_ORIGIN`).

### Operator lock

A local kiosk lock, not authentication: the PIN and the "token" are both baked into the bundle at build time (`env.appLock`), `JwtLockTokenServices` just compares strings, and the token is kept in `sessionStorage`. Do not treat it as a server-side security boundary.

## Conventions

- UI copy, error messages, and code comments are in **Indonesian**. Keep new strings consistent with that.
- TypeScript is split into four projects: `tsconfig.app.json` (src, DOM, bundler resolution), `tsconfig.node.json` (`vite.config.ts` + `build/`), `tsconfig.api.json` (typecheck-only for `api/` + `server/`), `tsconfig.server.json` (emits `dist-server/`). Server/api code uses NodeNext resolution, so relative imports there carry `.js` extensions.
- UI theming lives in CSS variables on `:root` in `src/index.css` (`--theme-*`); frame preset colours are separate because they belong to the printed output, not the interface.
- PWA (`vite-plugin-pwa`, autoUpdate) precaches assets; `/api/`, `/download/`, and `/templates/` are excluded from the navigation fallback.
- Longer specs live in `docs/` (`flow-app.md`, `fedora-docker-deployment.md`, `fedora-local-deployment.md`, `fedora-cloudflare-caddy.md`, `cloudflare-r2-public-sharing.md` — R2 is designed but not wired up).
