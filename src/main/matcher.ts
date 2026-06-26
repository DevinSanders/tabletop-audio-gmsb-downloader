import type { TtaManifestTrack } from '@shared/manifest'
import { deriveVariant, type BaseType, type VariantType } from '@shared/variants'

/**
 * Maps a Tabletop Audio file name to (a) its manifest track and (b) a variant
 * classification, ported from gmsb-seed-library/Generate-Library.ps1.
 *
 * Variant is decided on two axes (case- and underscore-insensitive):
 *   base type  - MUS_Only/Music_Only -> music_only; AMB_Only/Ambience_Only ->
 *                ambient; neither -> full.
 *   isolation  - any residual tokens after the number, the canonical title and
 *                the base-type token are removed (No_Queen, No_Ravens, Min, ...).
 *                Their presence forces the bucket to `other`.
 *
 * Match is primarily by the leading track number (TTA files are prefixed, e.g.
 * 515_Raven_Queen...), falling back to a normalized-title lookup. New tracks can
 * appear on Patreon before the public manifest lists them, so an unmatched file
 * still classifies and downloads (enriched on a later run).
 */

export interface ClassifiedFile {
  trackNumber: number | null
  baseType: BaseType
  /** The 4-bucket filter value: `other` whenever isolation tokens are present. */
  variant: VariantType
  /** Residual isolation descriptor, snake_case, e.g. "no_queen_no_ravens". */
  altDescriptor?: string
  matched: TtaManifestTrack | null
  /** Display title (manifest title when matched, else cleaned file name). */
  title: string
}

export interface ManifestIndex {
  byKey: Map<number, TtaManifestTrack>
  byTitle: Map<string, TtaManifestTrack>
  byTight: Map<string, TtaManifestTrack>
}

// ── string helpers (mirror Normalize/Tight in the PS script) ────────────────

function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '')
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tight(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '')
}

const BASE_MUSIC_RE = /(?:^|[ _\-])(?:mus|music)[ _]?only(?=$|[ _\-])/i
const BASE_AMBIENT_RE = /(?:^|[ _\-])(?:amb|ambient|ambience)[ _]?only(?=$|[ _\-])/i

// A trailing run of one or more isolation qualifiers (No_X, Min, Loop, vN, altN).
const ISOLATION_RUN_RE =
  /((?:[ _\-]+(?:no[ _]?[a-z]+|min(?:imal)?(?:[ _]?music)?|loop\d*|alt\d*|v\d+|take\d*))+)\s*$/i

export function indexManifest(tracks: TtaManifestTrack[]): ManifestIndex {
  const byKey = new Map<number, TtaManifestTrack>()
  const byTitle = new Map<string, TtaManifestTrack>()
  const byTight = new Map<string, TtaManifestTrack>()
  for (const t of tracks) {
    byKey.set(t.key, t)
    const nt = normalize(t.track_title)
    if (!byTitle.has(nt)) byTitle.set(nt, t)
    const tt = tight(t.track_title)
    if (!byTight.has(tt)) byTight.set(tt, t)
  }
  return { byKey, byTitle, byTight }
}

function leadingNumber(name: string): { num: number | null; rest: string } {
  const m = name.match(/^(\d+)[ _\-]+/)
  if (m) return { num: parseInt(m[1], 10), rest: name.slice(m[0].length) }
  return { num: null, rest: name }
}

function detectBaseType(rest: string): { baseType: BaseType; stripped: string } {
  if (BASE_MUSIC_RE.test(rest)) {
    return { baseType: 'music_only', stripped: rest.replace(BASE_MUSIC_RE, ' ') }
  }
  if (BASE_AMBIENT_RE.test(rest)) {
    return { baseType: 'ambient', stripped: rest.replace(BASE_AMBIENT_RE, ' ') }
  }
  return { baseType: 'full', stripped: rest }
}

/** Split a base-stripped name into its title core and a trailing isolation descriptor. */
function splitIsolation(baseStripped: string): { core: string; residual: string } {
  const m = baseStripped.match(ISOLATION_RUN_RE)
  if (!m || m.index === undefined) return { core: baseStripped, residual: '' }
  const core = baseStripped.slice(0, m.index)
  const residual = m[1]
    .split(/[ _\-]+/)
    .filter(Boolean)
    .join('_')
    .toLowerCase()
  return { core, residual }
}

function titleCase(s: string): string {
  const small = new Set(['of', 'the', 'a', 'an', 'and', 'in', 'on', 'to', 'de', 'le'])
  return normalize(s)
    .split(' ')
    .filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

export function classifyFile(fileName: string, idx: ManifestIndex): ClassifiedFile {
  const base = stripExt(fileName)
  const { num, rest } = leadingNumber(base)
  const { baseType, stripped } = detectBaseType(rest)
  const { core, residual: filenameResidual } = splitIsolation(stripped)

  // Resolve the manifest track: number first, then normalized/tight title core.
  let matched: TtaManifestTrack | null = null
  if (num != null && idx.byKey.has(num)) {
    matched = idx.byKey.get(num)!
  } else {
    const nKey = normalize(core)
    matched = idx.byTitle.get(nKey) ?? idx.byTight.get(tight(core)) ?? null
  }

  // Residual isolation tokens. When matched, derive them by removing the exact
  // canonical title (most precise); otherwise use the filename-derived split.
  let altDescriptor: string | undefined
  if (matched) {
    const normRest = normalize(stripped)
    const normTitle = normalize(matched.track_title)
    let r = normRest
    if (normRest.startsWith(normTitle)) r = normRest.slice(normTitle.length)
    else if (normTitle && normRest.includes(normTitle)) r = normRest.replace(normTitle, ' ')
    r = r.trim().replace(/\s+/g, '_')
    if (r) altDescriptor = r
  } else if (filenameResidual) {
    altDescriptor = filenameResidual
  }

  // A stem with an isolation/removal token (No_X, Min) becomes its "Additional"
  // bucket; a full mix with one becomes "Other". A version/re-upload marker
  // (e.g. "Redo 2025") is NOT isolation, so "Music Only, Redo 2025" stays
  // Music Only. The descriptor is still kept for the display name + alt tag.
  const variant: VariantType = deriveVariant(baseType, altDescriptor)
  const title = matched ? matched.track_title : titleCase(core || stripped)

  return { trackNumber: num, baseType, variant, altDescriptor, matched, title }
}

/** Pretty descriptor, e.g. "no_queen_no_ravens" -> "No Queen No Ravens". */
export function prettyAlt(descriptor: string): string {
  return descriptor
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Display name from raw parts, e.g. "Raven Queen (Ambient Only, No Queen)". */
export function composeName(title: string, baseType: BaseType, altDescriptor?: string): string {
  const parts: string[] = []
  if (baseType === 'music_only') parts.push('Music Only')
  else if (baseType === 'ambient') parts.push('Ambient Only')
  if (altDescriptor) parts.push(prettyAlt(altDescriptor))
  return parts.length ? `${title} (${parts.join(', ')})` : title
}

/** Display name for a classified file (UI / GMSB track name). */
export function displayName(c: ClassifiedFile): string {
  return composeName(c.title, c.baseType, c.altDescriptor)
}
