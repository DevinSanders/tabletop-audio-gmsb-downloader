/**
 * Game Master Sound Board library import/export document, Schema 2.
 *
 * Mirrors `LibraryTransferService.ExportDocument` in the GMSB source
 * (../Game Master Sound Board/SoundBoard.UI/Services/LibraryTransferService.cs).
 * Keys are PascalCase to match System.Text.Json defaults. The importer omits
 * null-valued fields and defaults missing numeric track fields (fades, etc.) to
 * zero, so we emit only the meaningful track fields (matching the existing
 * gmsb-seed-library output).
 */

export const GMSB_SCHEMA_VERSION = 2

/** GMSB's built-in audio bus ids (seeded on first launch; Music is the default). */
export const GMSB_BUS = {
  music: 1,
  ambient: 2,
  sfx: 3
} as const

export interface GmsbTrack {
  Id: number
  Name: string
  FilePath: string
  /** Comma-delimited; GMSB does Tags.Split(',') then trims. */
  Tags: string
  Volume: number
  IsLooping: boolean
  /** Target audio bus (Bus.Id). Ignored by GMSB importers that predate BusId. */
  BusId: number
}

export interface GmsbPresetTrack {
  TrackId: number
  Order: number
}

export interface GmsbPreset {
  Id: number
  Name: string
  Tracks: GmsbPresetTrack[]
}

export interface GmsbPlaylistItem {
  Order: number
  TrackId?: number | null
  PresetId?: number | null
}

export interface GmsbPlaylist {
  Id: number
  Name: string
  Items: GmsbPlaylistItem[]
}

export interface GmsbShortcutButton {
  Label?: string | null
  Row: number
  Column: number
  TrackId?: number | null
  PresetId?: number | null
}

export interface GmsbShortcutPage {
  Name: string
  OrderIndex: number
  Buttons: GmsbShortcutButton[]
}

export interface GmsbExportDocument {
  Schema: number
  /** ISO-8601 UTC, e.g. 2026-05-29T21:11:03.1074401Z. */
  ExportedAt: string
  Tracks: GmsbTrack[]
  Presets: GmsbPreset[]
  Playlists: GmsbPlaylist[]
  ShortcutPages: GmsbShortcutPage[]
}
