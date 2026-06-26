import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { TTA_MANIFEST_URL, type TtaManifest, type TtaManifestTrack } from '@shared/manifest'

const CACHE_FILE = 'tta_data.cache.json'
const MAX_AGE_MS = 1000 * 60 * 60 * 6 // 6 hours

/** Pure parse + shape validation (unit-tested against the cached fixture). */
export function parseManifest(raw: string): TtaManifestTrack[] {
  const doc = JSON.parse(raw) as TtaManifest
  if (!doc || !Array.isArray(doc.tracks)) {
    throw new Error('Unexpected Tabletop Audio manifest shape (no tracks array).')
  }
  return doc.tracks
}

/**
 * Returns the manifest tracks, preferring a fresh network copy and falling back
 * to (or refreshing) an on-disk cache in `cacheDir`. Network failure with a
 * present cache returns the stale cache rather than throwing.
 */
export async function loadManifest(
  cacheDir: string,
  opts: { force?: boolean; fetchImpl?: typeof fetch } = {}
): Promise<TtaManifestTrack[]> {
  const cachePath = join(cacheDir, CACHE_FILE)
  const doFetch = opts.fetchImpl ?? fetch

  if (!opts.force) {
    try {
      const stat = await fs.stat(cachePath)
      if (Date.now() - stat.mtimeMs < MAX_AGE_MS) {
        return parseManifest(await fs.readFile(cachePath, 'utf8'))
      }
    } catch {
      /* no usable cache; fall through to network */
    }
  }

  try {
    const res = await doFetch(TTA_MANIFEST_URL)
    if (!res.ok) throw new Error(`Manifest request failed: HTTP ${res.status}`)
    const raw = await res.text()
    const tracks = parseManifest(raw)
    await fs.writeFile(cachePath, raw, 'utf8').catch(() => {})
    return tracks
  } catch (err) {
    try {
      return parseManifest(await fs.readFile(cachePath, 'utf8'))
    } catch {
      throw err
    }
  }
}
