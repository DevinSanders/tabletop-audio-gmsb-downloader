import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { emptyUseCase, type UseCaseTags } from '@shared/usecase'

export const USECASE_URL = 'https://tabletopaudio.com/bootstrap/js/tags_data.js'
const CACHE_FILE = 'tags_data.cache.js'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 // 24 hours

/**
 * Parse the site's `var useCaseTags = { "514": { civ:[...], ... }, ... }` blob
 * into a key->tags map. The source is JS (not JSON): it has // comments,
 * unquoted property names, and the occasional stray comma, so normalise before
 * JSON.parse.
 */
export function parseUseCaseTags(src: string): Record<string, UseCaseTags> {
  const m = src.match(/useCaseTags\s*=\s*(\{[\s\S]*\})\s*;/)
  if (!m) throw new Error('Could not locate useCaseTags object in tags_data.js')
  const body = m[1]
    .replace(/\/\/[^\n]*/g, '') // line comments
    .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":') // quote bare keys
    .replace(/\[\s*,/g, '[') // leading comma in an array
    .replace(/,\s*,/g, ',') // doubled commas
    .replace(/,(\s*[}\]])/g, '$1') // trailing commas

  const raw = JSON.parse(body) as Record<string, Partial<UseCaseTags>>
  const out: Record<string, UseCaseTags> = {}
  for (const [key, val] of Object.entries(raw)) {
    out[key] = {
      civ: val.civ ?? [],
      biome: val.biome ?? [],
      mood: val.mood ?? [],
      action: val.action ?? []
    }
  }
  return out
}

/** Fetch (cached) and parse the use-case tags. Returns {} on failure. */
export async function loadUseCaseTags(
  cacheDir: string,
  opts: { force?: boolean; fetchImpl?: typeof fetch } = {}
): Promise<Record<string, UseCaseTags>> {
  const cachePath = join(cacheDir, CACHE_FILE)
  const doFetch = opts.fetchImpl ?? fetch

  if (!opts.force) {
    try {
      const stat = await fs.stat(cachePath)
      if (Date.now() - stat.mtimeMs < MAX_AGE_MS) {
        return parseUseCaseTags(await fs.readFile(cachePath, 'utf8'))
      }
    } catch {
      /* fall through to network */
    }
  }

  try {
    const res = await doFetch(USECASE_URL)
    if (!res.ok) throw new Error(`tags_data.js request failed: HTTP ${res.status}`)
    const src = await res.text()
    const parsed = parseUseCaseTags(src)
    await fs.writeFile(cachePath, src, 'utf8').catch(() => {})
    return parsed
  } catch {
    try {
      return parseUseCaseTags(await fs.readFile(cachePath, 'utf8'))
    } catch {
      return {} // optional enrichment; never fatal
    }
  }
}

export function useCaseForKey(
  map: Record<string, UseCaseTags>,
  key: number | null
): UseCaseTags {
  if (key == null) return emptyUseCase()
  return map[String(key)] ?? emptyUseCase()
}
