import type { Catalog, CatalogFile, CatalogTrack, SoundpadEntry } from '@shared/catalog'
import type { TtaManifestTrack } from '@shared/manifest'
import type { Ledger } from '@shared/ledger'
import type { VariantType } from '@shared/variants'
import { classifyFile, composeName, pureStem, type ManifestIndex } from './matcher'
import type { RawPack, RawPatreonFile, RawSoundpad } from './patreon'
import type { UseCaseTags } from '@shared/usecase'
import { useCaseForKey } from './usecase'

/** Subfolder (under the download root) each variant is stored in. */
export function variantFolder(variant: VariantType): string {
  switch (variant) {
    case 'full':
      return 'Full'
    case 'music_only':
      return 'Music Only'
    case 'additional_music':
      return 'Additional Music Only'
    case 'ambient':
      return 'Ambient Only'
    case 'additional_ambient':
      return 'Additional Ambient'
    case 'other':
      return 'Other'
  }
}

/** POSIX relative path (from the download root) for a catalog file. */
export function relativePathFor(file: Pick<CatalogFile, 'variant' | 'fileName'>): string {
  return `${variantFolder(file.variant)}/${file.fileName}`
}

function basename(url: string): string {
  const clean = url.split(/[?#]/)[0]
  return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1))
}

/**
 * Joins the manifest (public Full links, available to everyone), the enumerated
 * Patreon attachments (tier-gated alternates), and the ledger (already-downloaded
 * flags) into the grouped catalog the UI renders.
 */
export function assembleCatalog(
  manifestTracks: TtaManifestTrack[],
  idx: ManifestIndex,
  patreonFiles: RawPatreonFile[],
  patreonPads: RawSoundpad[],
  useCaseByKey: Record<string, UseCaseTags>,
  ledger: Ledger,
  now: Date,
  patreonPacks: RawPack[] = []
): Catalog {
  const have = new Set(ledger.entries.map((e) => e.fileId))
  const groups = new Map<string, CatalogTrack>()
  const groupKey = (num: number | null, title: string): string =>
    num != null ? `n${num}` : `t${title.toLowerCase()}`

  // track_genre occasionally comma-joins values in a single string element.
  const splitGenres = (g?: string[]): string[] =>
    (g ?? []).flatMap((x) => x.split(',').map((s) => s.trim())).filter(Boolean)

  const ensureGroup = (
    num: number | null,
    title: string,
    m?: TtaManifestTrack
  ): CatalogTrack => {
    const gk = groupKey(num, title)
    let g = groups.get(gk)
    if (!g) {
      g = {
        key: m?.key ?? null,
        number: num,
        title,
        genres: splitGenres(m?.track_genre),
        tags: m?.tags ?? [],
        useCase: useCaseForKey(useCaseByKey, m?.key ?? num),
        trackType: m?.track_type,
        imageUrl: m?.small_image,
        files: []
      }
      groups.set(gk, g)
    } else if (m && g.key == null) {
      // A Patreon-only group that the manifest now describes — enrich it.
      g.key = m.key
      g.genres = splitGenres(m.track_genre)
      g.tags = m.tags
      g.useCase = useCaseForKey(useCaseByKey, m.key)
      g.trackType = m.track_type
      g.imageUrl = m.small_image
    }
    return g
  }

  // 1. Public version for every manifest track. For a pure-music / pure-ambience
  //    track this IS the music-only / ambient-only stem, so classify it as such.
  for (const m of manifestTracks) {
    const g = ensureGroup(m.key, m.track_title, m)
    const fileId = `public:${m.key}`
    const stem = pureStem(m.track_type) ?? 'full'
    g.files.push({
      fileId,
      fileName: basename(m.link),
      displayName: composeName(m.track_title, stem),
      variant: stem,
      baseType: stem,
      source: 'public',
      url: m.link,
      locked: false,
      alreadyDownloaded: have.has(fileId)
    })
  }

  // 2. Patreon attachments (alternates + any Full not already covered publicly).
  let hasPatreonAccess = false
  for (const pf of patreonFiles) {
    const c = classifyFile(pf.fileName, idx)
    // Group by the resolved manifest key so a number-less file matched by title
    // (e.g. "Lonesome West No Horses No Rain") joins its numbered track.
    const groupNumber = c.trackNumber ?? c.matched?.key ?? null
    const g = ensureGroup(groupNumber, c.title, c.matched ?? undefined)
    // Same recording as the public link (no descriptor once bitrate markers like
    // "_320" are stripped) — keep the public copy. Versions ("Redo 2025") and
    // isolations still carry a descriptor, so they're kept as separate files.
    if (!c.altDescriptor && g.files.some((f) => f.source === 'public' && f.variant === c.variant)) {
      continue
    }
    if (pf.canView) hasPatreonAccess = true
    const fileId = `patreon:${pf.fileName}`
    g.files.push({
      fileId,
      fileName: pf.fileName,
      displayName: composeName(c.title, c.baseType, c.altDescriptor),
      variant: c.variant,
      baseType: c.baseType,
      altDescriptor: c.altDescriptor,
      source: 'patreon',
      url: pf.url,
      locked: !pf.canView,
      postId: pf.postId,
      alreadyDownloaded: have.has(fileId)
    })
  }

  // 3. Soundpads (each a zip → many sounds + a ShortcutPage).
  const padsHave = new Set(ledger.pads.map((p) => p.slug))
  const soundpads: SoundpadEntry[] = patreonPads
    .map((p) => {
      if (p.canView) hasPatreonAccess = true
      return {
        padId: `pad:${p.postId}`,
        postId: p.postId,
        name: p.name,
        slug: p.slug,
        archiveFileName: p.archiveFileName,
        archiveUrl: p.archiveUrl,
        isZip: p.isZip,
        imageUrl: p.imageUrl,
        locked: !p.canView,
        alreadyDownloaded: padsHave.has(p.slug)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // 4. Audio packs (zips of tracks in regular posts) — extracted and classified
  //    as ordinary tracks on download, no shortcut page.
  const packsHave = new Set((ledger.packs ?? []).map((p) => p.packId))
  const packs: SoundpadEntry[] = patreonPacks
    .map((p) => {
      if (p.canView) hasPatreonAccess = true
      const id = packId(p)
      return {
        padId: id,
        postId: p.postId,
        name: p.name,
        slug: id,
        archiveFileName: p.archiveFileName,
        archiveUrl: p.archiveUrl,
        isZip: p.isZip,
        locked: !p.canView,
        alreadyDownloaded: packsHave.has(id)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const tracks = [...groups.values()].sort((a, b) => (b.number ?? 0) - (a.number ?? 0))
  return { generatedAt: now.toISOString(), tracks, soundpads, packs, hasPatreonAccess }
}

/** Stable selection id for an audio pack archive. */
export function packId(p: Pick<RawPack, 'postId' | 'archiveFileName'>): string {
  return `pack:${p.postId}:${p.archiveFileName}`
}
