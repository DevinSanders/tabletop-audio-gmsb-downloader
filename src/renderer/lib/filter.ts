import type { Catalog, CatalogFile, CatalogTrack } from '@shared/catalog'
import type { VariantType } from '@shared/variants'
import { USECASE_CATEGORIES, type UseCaseCategory } from '@shared/usecase'

export interface FilterState {
  variants: Set<VariantType>
  search: string
  genres: Set<string>
  /** Use-case filter ids of the form "category:key", e.g. "mood:peaceful". */
  useCase: Set<string>
  newOnly: boolean
  hideLocked: boolean
}

export function defaultFilters(): FilterState {
  return {
    variants: new Set<VariantType>([
      'full',
      'music_only',
      'additional_music',
      'ambient',
      'additional_ambient',
      'other'
    ]),
    search: '',
    genres: new Set<string>(),
    useCase: new Set<string>(),
    newOnly: true,
    hideLocked: false
  }
}

/** A file passes if its variant is enabled, not filtered out as already-downloaded/locked. */
export function fileVisible(file: CatalogFile, f: FilterState): boolean {
  if (!f.variants.has(file.variant)) return false
  if (f.newOnly && file.alreadyDownloaded) return false
  if (f.hideLocked && file.locked) return false
  return true
}

function trackMatchesSearch(track: CatalogTrack, search: string): boolean {
  if (!search) return true
  const q = search.toLowerCase()
  if (track.title.toLowerCase().includes(q)) return true
  return track.tags.some((t) => t.toLowerCase().includes(q))
}

function trackMatchesGenres(track: CatalogTrack, genres: Set<string>): boolean {
  if (genres.size === 0) return true
  return track.genres.some((g) => genres.has(g.toLowerCase()))
}

/** AND across categories, OR within a category (matches the site's intent). */
function trackMatchesUseCase(track: CatalogTrack, useCase: Set<string>): boolean {
  if (useCase.size === 0) return true
  const byCat = new Map<UseCaseCategory, Set<string>>()
  for (const id of useCase) {
    const [cat, key] = id.split(':') as [UseCaseCategory, string]
    if (!byCat.has(cat)) byCat.set(cat, new Set())
    byCat.get(cat)!.add(key)
  }
  for (const [cat, keys] of byCat) {
    const trackKeys = track.useCase[cat] ?? []
    if (!trackKeys.some((k) => keys.has(k))) return false
  }
  return true
}

/** All use-case filter ids present across the catalog, by category. */
export function availableUseCase(catalog: Catalog): Record<UseCaseCategory, string[]> {
  const sets: Record<UseCaseCategory, Set<string>> = {
    civ: new Set(),
    biome: new Set(),
    mood: new Set(),
    action: new Set()
  }
  for (const t of catalog.tracks) {
    for (const c of USECASE_CATEGORIES) for (const k of t.useCase[c]) sets[c].add(k)
  }
  return {
    civ: [...sets.civ],
    biome: [...sets.biome],
    mood: [...sets.mood],
    action: [...sets.action]
  }
}

/** Tracks (with their visible files) that pass the filter. Tracks with no visible files drop out. */
export function visibleTracks(catalog: Catalog, f: FilterState): Array<CatalogTrack & { visibleFiles: CatalogFile[] }> {
  const out: Array<CatalogTrack & { visibleFiles: CatalogFile[] }> = []
  for (const track of catalog.tracks) {
    if (!trackMatchesSearch(track, f.search)) continue
    if (!trackMatchesGenres(track, f.genres)) continue
    if (!trackMatchesUseCase(track, f.useCase)) continue
    const visibleFiles = track.files.filter((file) => fileVisible(file, f))
    if (visibleFiles.length === 0) continue
    out.push({ ...track, visibleFiles })
  }
  return out
}

/** All genre tokens present across the catalog (lowercased, sorted), excluding type markers. */
export function availableGenres(catalog: Catalog): string[] {
  const skip = new Set(['music', 'ambience', 'ambient', 'sound effects', 'sfx'])
  const set = new Set<string>()
  for (const t of catalog.tracks) {
    for (const g of t.genres) {
      const gl = g.toLowerCase().trim()
      if (gl && !skip.has(gl)) set.add(gl)
    }
  }
  return [...set].sort()
}

/** Selectable = visible, not already downloaded, not locked. */
export function selectableFileIds(
  tracks: Array<CatalogTrack & { visibleFiles: CatalogFile[] }>
): string[] {
  const ids: string[] = []
  for (const t of tracks) {
    for (const f of t.visibleFiles) {
      if (!f.alreadyDownloaded && !f.locked) ids.push(f.fileId)
    }
  }
  return ids
}
