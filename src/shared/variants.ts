/**
 * Classification buckets for a Tabletop Audio file, derived from its name.
 * Two axes: a base stem (full / music-only / ambient-only) and whether extra
 * isolation/version tokens are present. A stem with extra tokens becomes its
 * "Additional" bucket; a full mix with extra tokens becomes "Other".
 */
export type VariantType =
  | 'full'
  | 'music_only'
  | 'additional_music'
  | 'ambient'
  | 'additional_ambient'
  | 'other'

/** The base-type axis, independent of isolation. */
export type BaseType = 'full' | 'music_only' | 'ambient'

export const VARIANT_ORDER: readonly VariantType[] = [
  'full',
  'music_only',
  'additional_music',
  'ambient',
  'additional_ambient',
  'other'
]

export const VARIANT_LABELS: Record<VariantType, string> = {
  full: 'Full',
  music_only: 'Music Only',
  additional_music: 'Additional Music Only',
  ambient: 'Ambient Only',
  additional_ambient: 'Additional Ambient',
  other: 'Other Alternate Versions'
}

/** Token used in the GMSB `type:` tag. */
export const VARIANT_TAG: Record<VariantType, string> = {
  full: 'full',
  music_only: 'music_only',
  additional_music: 'additional_music_only',
  ambient: 'ambient',
  additional_ambient: 'additional_ambient',
  other: 'other'
}

/**
 * True when a residual descriptor denotes a distinct alternate mix (a removal /
 * isolation), as opposed to a mere version/re-upload marker. Only isolation
 * markers promote a file into an "Additional"/"Other" bucket:
 *   - "no_queen", "no_horses_no_rain", "no_party"  -> isolation (removed element)
 *   - "min" / "minimal"                            -> isolation (stripped-down mix)
 *   - "redo_2025", "v2", "remaster", "2025"        -> version only (NOT isolation)
 */
export function isIsolationDescriptor(descriptor?: string): boolean {
  if (!descriptor) return false
  return descriptor
    .split('_')
    .filter(Boolean)
    .some((t) => t === 'no' || t === 'min' || t === 'minimal')
}

/**
 * Resolve the bucket from the base stem + residual descriptor. Centralised so the
 * classifier and the GMSB tag writer agree (and so already-downloaded entries
 * re-tag correctly from stored baseType + altDescriptor).
 */
export function deriveVariant(baseType: BaseType, descriptor?: string): VariantType {
  const additional = isIsolationDescriptor(descriptor)
  if (baseType === 'music_only') return additional ? 'additional_music' : 'music_only'
  if (baseType === 'ambient') return additional ? 'additional_ambient' : 'ambient'
  return additional ? 'other' : 'full'
}
