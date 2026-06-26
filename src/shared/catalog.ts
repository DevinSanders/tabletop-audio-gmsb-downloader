import type { BaseType, VariantType } from './variants'
import type { UseCaseTags } from './usecase'

/** A single downloadable file discovered for a track. */
export interface CatalogFile {
  /** Stable identity used by the ledger and the UI selection set. */
  fileId: string
  fileName: string
  /** Human label, e.g. "Raven Queen (Ambient Only)". */
  displayName: string
  variant: VariantType
  baseType: BaseType
  /** Residual isolation tokens for "other" variants, e.g. "no_queen". */
  altDescriptor?: string
  source: 'public' | 'patreon'
  /** Direct download URL (public link, or a resolved Patreon attachment URL). */
  url: string
  sizeBytes?: number
  /** True when the file sits behind a tier the signed-in account lacks. */
  locked: boolean
  /** Patreon post id, when source === 'patreon'. */
  postId?: string
  /** True if this fileId already appears in the download ledger. */
  alreadyDownloaded: boolean
}

/** A track grouping its available files. Keyed to a manifest entry when matched. */
export interface CatalogTrack {
  /** Manifest key (== TTA track number) when matched, else null. */
  key: number | null
  /** Numeric prefix parsed from filenames, when present. */
  number: number | null
  title: string
  genres: string[]
  tags: string[]
  /** Curated Civilization/Biome/Mood/Action tags from tags_data.js. */
  useCase: UseCaseTags
  trackType?: string
  imageUrl?: string
  files: CatalogFile[]
}

/** A downloadable soundpad (zip) that expands into many sounds + a GMSB ShortcutPage. */
export interface SoundpadEntry {
  /** Stable selection id, e.g. `pad:<postId>`. */
  padId: string
  postId: string
  name: string
  slug: string
  archiveFileName: string
  archiveUrl: string
  isZip: boolean
  imageUrl?: string
  locked: boolean
  alreadyDownloaded: boolean
}

export interface Catalog {
  generatedAt: string
  /** Total distinct tracks (manifest size, plus any Patreon-only extras). */
  tracks: CatalogTrack[]
  soundpads: SoundpadEntry[]
  /** True if any Patreon-sourced (gated) files are present and unlocked. */
  hasPatreonAccess: boolean
}
