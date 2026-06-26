/** Tabletop Audio public metadata manifest (https://tabletopaudio.com/tta_data). */

export const TTA_MANIFEST_URL = 'https://tabletopaudio.com/tta_data'

export interface TtaManifestTrack {
  /** TTA track number; the join key to Patreon filename prefixes. */
  key: number
  track_title: string
  /** e.g. "ambience + music", "ambience", "music". */
  track_type: string
  /** e.g. ["music", "fantasy", "historical"]. */
  track_genre: string[]
  flavor_text?: string
  /** Public, free, full-version mp3 URL. */
  link: string
  small_image?: string
  large_image?: string
  /** Present as the string "true" on recently added tracks. */
  new?: string
  tags: string[]
}

export interface TtaManifest {
  tracks: TtaManifestTrack[]
}
