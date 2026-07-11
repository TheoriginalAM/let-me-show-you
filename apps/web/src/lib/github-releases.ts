import 'server-only'

// Owner/repo the desktop app is released from. Override with GITHUB_REPO if your
// GitHub repository differs from the default.
const REPO = process.env.GITHUB_REPO ?? 'TheoriginalAM/let-me-show-you'

export interface DownloadAssets {
  version: string
  htmlUrl: string
  macArm: string | null
  macIntel: string | null
  win: string | null
}

interface GhAsset {
  name: string
  browser_download_url: string
}
interface GhRelease {
  tag_name: string
  html_url: string
  assets: GhAsset[]
}

/**
 * Latest desktop release from the GitHub Releases API, cached for an hour. Reads
 * an optional GITHUB_TOKEN for a higher rate limit. Returns null if there is no
 * release yet or the API is unreachable.
 */
export async function getLatestRelease(): Promise<DownloadAssets | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  try {
    // Fetch live: the Next Data Cache (persisted across Railway builds) otherwise
    // pins a stale release long after a new one ships. This page is low-traffic,
    // so GitHub's unauthenticated rate limit is not a concern.
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const release = (await res.json()) as GhRelease
    const find = (pred: (name: string) => boolean): string | null =>
      release.assets.find((asset) => pred(asset.name.toLowerCase()))?.browser_download_url ?? null

    return {
      version: release.tag_name.replace(/^v/, ''),
      htmlUrl: release.html_url,
      macArm: find((name) => name.endsWith('.dmg') && name.includes('arm64')),
      macIntel: find((name) => name.endsWith('.dmg') && !name.includes('arm64')),
      win: find((name) => name.endsWith('.exe')),
    }
  } catch {
    return null
  }
}

export function releasesUrl(): string {
  return `https://github.com/${REPO}/releases`
}
