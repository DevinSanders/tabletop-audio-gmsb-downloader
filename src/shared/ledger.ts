import type { BaseType, VariantType } from './variants'

/** Lives at <downloadFolder>/.tta-gmsb-ledger.json. Drives only-download-new. */
export const LEDGER_FILENAME = '.tta-gmsb-ledger.json'
export const LEDGER_VERSION = 1

/** The GMSB import library written alongside the ledger. */
export const LIBRARY_FILENAME = 'gmsb-library.json'

export interface LedgerEntry {
  /** Matches CatalogFile.fileId; the dedup key. */
  fileId: string
  fileName: string
  /** POSIX-separated path relative to the download root (portable). */
  relativePath: string
  variant: VariantType
  baseType: BaseType
  altDescriptor?: string
  source: 'public' | 'patreon'
  manifestKey: number | null
  trackNumber: number | null
  title: string
  sizeBytes?: number
  downloadedAt: string
  /** Stable GMSB track Id, assigned once and reused across runs. */
  gmsbTrackId: number
  /** Set when this entry is a sound extracted from a soundpad zip. */
  soundpad?: string
  padType?: 'sfx' | 'music' | 'ambient'
}

/** A soundpad whose zip has been downloaded + extracted. */
export interface PadLedgerEntry {
  slug: string
  name: string
  postId: string
  downloadedAt: string
}

export interface Ledger {
  version: number
  /** Absolute download root at last write (informational; relativePath is authoritative). */
  downloadRoot: string
  /** Monotonic allocator for gmsbTrackId. */
  nextGmsbTrackId: number
  entries: LedgerEntry[]
  /** Soundpads already extracted (drives skip + ShortcutPage generation). */
  pads: PadLedgerEntry[]
}

export function emptyLedger(downloadRoot: string): Ledger {
  return { version: LEDGER_VERSION, downloadRoot, nextGmsbTrackId: 1, entries: [], pads: [] }
}
