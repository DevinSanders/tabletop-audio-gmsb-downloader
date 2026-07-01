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

// Schema 3 adds the bus round-trip (Track.BusId + an exported Buses table). The
// GMSB importer only honors BusId when a Buses table is present, and it pins
// built-in bus ids by IsBuiltIn — so we must emit the built-ins below.
export const GMSB_SCHEMA_VERSION = 3

/** GMSB's built-in audio bus ids (seeded on first launch; Music is the default). */
export const GMSB_BUS = {
  music: 1,
  ambient: 2,
  sfx: 3
} as const

export interface GmsbBus {
  Id: number
  Name: string
  Order: number
  Color: string | null
  IsBuiltIn: boolean
  Volume: number
}

/**
 * The three built-in buses, mirroring GMSB's own seed (Music=1/Ambient=2/SFX=3,
 * orders 0/10/20). Emitting them with IsBuiltIn:true makes the importer map our
 * BusId values identity (1→1, 2→2, 3→3) instead of falling back to Music.
 */
export const BUILT_IN_BUSES: GmsbBus[] = [
  { Id: GMSB_BUS.music, Name: 'Music', Order: 0, Color: null, IsBuiltIn: true, Volume: 1.0 },
  { Id: GMSB_BUS.ambient, Name: 'Ambient', Order: 10, Color: null, IsBuiltIn: true, Volume: 1.0 },
  { Id: GMSB_BUS.sfx, Name: 'SFX', Order: 20, Color: null, IsBuiltIn: true, Volume: 1.0 }
]

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
  Buses: GmsbBus[]
  Tracks: GmsbTrack[]
  Presets: GmsbPreset[]
  Playlists: GmsbPlaylist[]
  ShortcutPages: GmsbShortcutPage[]
}
