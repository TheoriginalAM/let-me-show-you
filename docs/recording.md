# Recording pipeline (apps/desktop)

How the desktop recorder turns a screen + mic into a shareable MP4. Capture runs
in the **renderer** (it needs browser media APIs); file writing and transcoding
run in the **main** process (they need Node + a bundled ffmpeg). The two talk
only over the typed IPC bridge in [`src/shared/ipc.ts`](../apps/desktop/src/shared/ipc.ts).

## Flow

```
 renderer (capture.ts)                         main (recording-session.ts)
 ─────────────────────                         ───────────────────────────
 pick source + mic
 getUserMedia(desktop, sourceId)  ── start ──▶ open temp .webm  (state: recording)
 getUserMedia(mic, echo/noise)
 combine tracks → MediaStream
 MediaRecorder(vp9/opus, 8Mbps)
   .start(1000)  ── 1 chunk/s ──── writeChunk ▶ append to temp .webm  (never buffered)
 pause()/resume()  ───────── pause/resume ────▶ accumulate elapsed  (state: paused)
 stop()  → flush final chunk ──── finish ─────▶ close file          (state: processing)
                                                ffmpeg webm → MP4    (progress 0..1)
                                                ffmpeg frame @1s → thumbnail
                                                move to ~/Movies/LetMeShowYou
                                                delete temp .webm    (state: ready)
```

The tray's **Stop Recording** sends `request-stop` to the renderer, which stops
the same `MediaRecorder` — main is never asked to stop a recorder it doesn't own.

## Capture (renderer)

- **Video** — `getUserMedia` with the legacy mandatory-constraints pattern:
  `chromeMediaSource: 'desktop'`, `chromeMediaSourceId: <sourceId>`, capped at
  1920×1080 / 30fps.
- **Audio** — a **separate** `getUserMedia` for the selected mic with
  `echoCancellation` + `noiseSuppression`. Its track is added to the same stream.
- **Encode** — `MediaRecorder` with `video/webm;codecs=vp9,opus` (falls back to
  `vp8,opus`) at `videoBitsPerSecond: 8_000_000`, `start(1000)`.
- Each `dataavailable` chunk is converted to a `Uint8Array` and sent over IPC
  (`writeChunk`), then discarded — **the whole recording is never held in
  renderer memory**. Writes are serialized through a promise chain to preserve
  chunk order.

## Transcode (main)

`ffmpeg` is bundled via [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static)
(a production dependency). Because the binary must stay executable on disk, it is
unpacked from the asar in a packaged build — see `asarUnpack` in
[`electron-builder.yml`](../apps/desktop/electron-builder.yml) — and the runtime
path rewrites `app.asar` → `app.asar.unpacked` (see [`src/main/ffmpeg.ts`](../apps/desktop/src/main/ffmpeg.ts)).

Transcode command:

```
ffmpeg -y -i <temp.webm> \
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 160k \
  -movflags +faststart \
  <out.mp4>
```

- **Progress** is a determinate bar parsed from ffmpeg's stderr `time=HH:MM:SS`
  markers against the known recording duration.
- **Thumbnail** — `ffmpeg -ss 1 -i out.mp4 -frames:v 1 -vf scale=320:-1` grabs a
  frame ~1s in; it's read back as a JPEG data URL for the "ready" screen
  (best-effort — a failure here doesn't fail the recording).

## Output

Saved to `~/Movies/LetMeShowYou/` (created if missing) as
`Recording YYYY-MM-DD at HH.mm.mp4`, with a `(2)`, `(3)`, … suffix on collision.

## State machine

`idle → recording ⇄ paused → processing → ready`, with any failure going to
`error`. The single source of truth is `RecordingSession` in main; it is
broadcast to the renderer (`recording-status`) and the tray. A freshly mounted
renderer pulls the current status via `getRecordingStatus`.

## Cleanup & errors

- **Success** — the temp `.webm` is deleted after the MP4 is written.
- **Failure** (disk full, ffmpeg crash, capture error) — the session goes to
  `error` and, when the temp `.webm` has data, **preserves it** and surfaces its
  path so the raw recording can be recovered.

## Out of scope (for now)

- **System / desktop audio** is not captured — **microphone only**. (TODO: add a
  loopback/system-audio source and mix it in.)
- The **webcam bubble** is a live preview window only; it is **not composited**
  into the recording (which is screen video + mic audio).
