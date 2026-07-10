# Let Me Show You

Screen-recording SaaS — [letmeshowyou.com.au](https://letmeshowyou.com.au).

A pnpm monorepo containing the desktop recorder, the marketing/web dashboard, and
the shared type layer that keeps them in sync.

## Structure

```
.
├── apps/
│   ├── desktop/        # Electron 33 + React 18 + Vite (electron-vite)
│   │   └── src/
│   │       ├── main/       # Electron main process
│   │       ├── preload/    # contextBridge preload (contextIsolation: true)
│   │       └── renderer/   # React renderer (nodeIntegration: false)
│   └── web/            # Next.js 15 (App Router) + Tailwind CSS
├── packages/
│   └── shared/         # @lmsy/shared — Video / User / ShareLink types + helpers
├── tsconfig.base.json  # shared TS compiler options, extended by each package
├── eslint.config.mjs   # single flat ESLint config for the whole repo
├── .prettierrc.json    # single Prettier config for the whole repo
└── pnpm-workspace.yaml
```

### Package boundaries (desktop)

The Electron app keeps the three processes strictly separated:

- **main** (`src/main`) — Node-privileged process; creates the `BrowserWindow`.
- **preload** (`src/preload`) — the only bridge to the renderer, via
  `contextBridge.exposeInMainWorld`. Exposes `window.lmsy`.
- **renderer** (`src/renderer`) — the React UI, run with
  `contextIsolation: true` and `nodeIntegration: false`.

### The shared package

`@lmsy/shared` is published as **TypeScript source** (no build step). Consumers
transpile it themselves:

- `apps/web` lists it in `next.config.ts` → `transpilePackages`.
- `apps/desktop` bundles it via electron-vite (it is excluded from
  `externalizeDepsPlugin`).

## Prerequisites

- **Node.js** ≥ 18.18 (developed on Node 24)
- **pnpm** 11 (this repo pins `pnpm@11.1.2` via `packageManager`)

> pnpm 10+ blocks dependency build (postinstall) scripts by default. The
> `electron`, `esbuild`, and `sharp` scripts are allow-listed in
> [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) under the pnpm 11 `allowBuilds`
> map, so `pnpm install` runs them without any prompt. Add new native
> dependencies to that map.

## Getting started

```bash
pnpm install
```

## Scripts (run from the repo root)

| Command              | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `pnpm dev:web`       | Start the Next.js dev server (http://localhost:3000)    |
| `pnpm dev:desktop`   | Launch the Electron app with HMR                        |
| `pnpm build:web`     | Production build of the Next.js app                     |
| `pnpm build:desktop` | Compile + package the desktop app with electron-builder |
| `pnpm lint`          | ESLint across the whole workspace                       |
| `pnpm typecheck`     | `tsc --noEmit` in every package                         |
| `pnpm format`        | Prettier write across the repo                          |

### Web

```bash
pnpm dev:web       # dev server on http://localhost:3000
pnpm build:web     # next build
```

### Desktop

```bash
pnpm dev:desktop   # opens the Electron window with live reload
pnpm build:desktop # electron-vite build && electron-builder
```

`build:desktop` produces installers under `apps/desktop/release/`:

- **macOS** — `dmg` for `arm64` and `x64` (`appId: au.com.letmeshowyou.desktop`)
- **Windows** — `nsis` installer for `x64`

Running `build:desktop` without target flags packages for the **current** OS.
Use `pnpm --filter @lmsy/desktop build:unpack` for a fast, unpacked `--dir` build.

App icons are not included yet — electron-builder uses the default Electron icon
until you add `icon.icns` / `icon.ico` under `apps/desktop/build/` (the configured
`buildResources` directory).

> **Code signing is not configured yet.** macOS builds are produced unsigned
> (`mac.identity: null`). Add signing certificates before distributing.

## Tooling

- **TypeScript** — one `tsconfig.base.json` at the root; each package extends it.
- **ESLint** — one flat config (`eslint.config.mjs`) with per-app overrides
  (Next.js Core Web Vitals for web, React Hooks/Refresh for the renderer).
- **Prettier** — one `.prettierrc.json` for the repo.
