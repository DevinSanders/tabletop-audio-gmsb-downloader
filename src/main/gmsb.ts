import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  BUILT_IN_BUSES,
  GMSB_BUS,
  GMSB_SCHEMA_VERSION,
  type GmsbExportDocument,
  type GmsbShortcutPage,
  type GmsbTrack
} from '@shared/gmsb-schema'
import { LIBRARY_FILENAME, type Ledger, type LedgerEntry } from '@shared/ledger'
import { deriveVariant, VARIANT_TAG } from '@shared/variants'
import { USECASE_CATEGORIES, type UseCaseTags } from '@shared/usecase'
import { composeName, type ManifestIndex } from './matcher'

// track_genre tokens that are type markers rather than genres.
const NON_GENRE = new Set(['music', 'ambience', 'ambient', 'sound effects', 'sfx'])

/** Comma-delimited GMSB tag string, mirroring the gmsb-seed-library convention. */
export function buildTags(
  entry: LedgerEntry,
  idx: ManifestIndex,
  useCaseByKey: Record<string, UseCaseTags>
): string {
  // Sounds extracted from a soundpad carry pad-specific tags, not manifest meta.
  if (entry.soundpad) {
    const category = entry.padType === 'sfx' ? 'event' : 'background'
    return [`type:${entry.padType}`, `category:${category}`, `soundpad:${entry.soundpad}`].join(', ')
  }

  const variant = deriveVariant(entry.baseType, entry.altDescriptor)
  const tags: string[] = [`type:${VARIANT_TAG[variant]}`, 'category:background']

  const m = entry.manifestKey != null ? idx.byKey.get(entry.manifestKey) : undefined
  if (m) {
    for (const g of m.track_genre) {
      // track_genre occasionally comma-joins values in one string element.
      for (const part of g.split(',')) {
        const gl = part.toLowerCase().trim()
        if (gl && !NON_GENRE.has(gl)) tags.push(`genre:${gl}`)
      }
    }
    for (const t of m.tags) {
      const tl = t.toLowerCase().trim()
      if (tl) tags.push(tl)
    }
  }

  // Curated Civilization/Biome/Mood/Action tags from tags_data.js.
  const uc = entry.manifestKey != null ? useCaseByKey[String(entry.manifestKey)] : undefined
  if (uc) {
    for (const category of USECASE_CATEGORIES) {
      for (const key of uc[category]) tags.push(`${category}:${key}`)
    }
  }

  if (entry.altDescriptor) tags.push(`alt:${entry.altDescriptor}`)

  return [...new Set(tags)].join(', ')
}

/** Absolute, native-separator path from the download root + POSIX relative path. */
function absolutePath(downloadFolder: string, relativePath: string): string {
  return resolve(downloadFolder, relativePath)
}

/**
 * Route each track to a GMSB bus: soundpad sounds by their pad type (one-shot
 * SFX -> SFX, loops -> Music/Ambient); regular TTA tracks by stem (ambient ->
 * Ambient, everything else -> Music). TTA tracks are never one-shots.
 */
function deriveBus(entry: LedgerEntry): number {
  if (entry.soundpad) {
    if (entry.padType === 'sfx') return GMSB_BUS.sfx
    if (entry.padType === 'ambient') return GMSB_BUS.ambient
    return GMSB_BUS.music
  }
  return entry.baseType === 'ambient' ? GMSB_BUS.ambient : GMSB_BUS.music
}

export function buildLibraryDocument(
  ledger: Ledger,
  idx: ManifestIndex,
  useCaseByKey: Record<string, UseCaseTags>,
  downloadFolder: string,
  now: Date
): GmsbExportDocument {
  const tracks: GmsbTrack[] = ledger.entries
    .slice()
    .sort((a, b) => a.gmsbTrackId - b.gmsbTrackId)
    .map((e) => ({
      Id: e.gmsbTrackId,
      Name: composeName(e.title, e.baseType, e.altDescriptor),
      FilePath: absolutePath(downloadFolder, e.relativePath),
      Tags: buildTags(e, idx, useCaseByKey),
      Volume: 1.0,
      // TTA beds loop; one-shot pad SFX do not.
      IsLooping: e.soundpad ? e.padType !== 'sfx' : true,
      BusId: deriveBus(e)
    }))

  return {
    Schema: GMSB_SCHEMA_VERSION,
    ExportedAt: now.toISOString(),
    // Emit the built-in buses so the importer honors each track's BusId.
    Buses: BUILT_IN_BUSES,
    Tracks: tracks,
    Presets: [],
    Playlists: [],
    ShortcutPages: buildShortcutPages(ledger)
  }
}

/** One ShortcutPage per downloaded soundpad, with a button per extracted sound. */
function buildShortcutPages(ledger: Ledger): GmsbShortcutPage[] {
  return ledger.pads.map((pad, pageIndex) => {
    const sounds = ledger.entries
      .filter((e) => e.soundpad === pad.slug)
      .sort((a, b) => a.fileName.localeCompare(b.fileName))
    return {
      Name: pad.name,
      OrderIndex: pageIndex,
      Buttons: sounds.map((e, i) => ({
        Label: e.title,
        Row: i,
        Column: 0,
        TrackId: e.gmsbTrackId
      }))
    }
  })
}

export async function writeLibrary(
  downloadFolder: string,
  doc: GmsbExportDocument
): Promise<string> {
  const path = join(downloadFolder, LIBRARY_FILENAME)
  await fs.writeFile(path, JSON.stringify(doc, null, 2), 'utf8')
  return path
}
