# GEMINI.md — Inspecting and categorizing a Tabletop Audio → GMSB library

You are helping a game master categorize an audio library for **Game Master Sound
Board (GMSB)**. The library was built by this repo's app, **Tabletop Audio → GMSB
Downloader**, from [Tabletop Audio](https://tabletopaudio.com) (TTA). Typical tasks:
find tracks by mood / scene / subject, and build themed GMSB **shortcut pages** with
button colors and icons that the user imports into GMSB.

## Ground rules

- **Never modify the app-owned files** in the library folder: `gmsb-library.json`
  and `.tta-gmsb-ledger.json`. The app regenerates them. Never touch audio files.
- Write your results as **new** files (e.g. `gmsb-<topic>-pages.json`) in the library
  folder, and put scratch/analysis files in your workspace, not the library folder.
- **The `Tags` in `gmsb-library.json` are a snapshot from download time** and can be
  incomplete (see [Known gaps](#known-gaps)). For categorization, always join each
  track to the **live** TTA metadata by **track number** (section 3).
- Validate every icon name against the GMSB icon list (section 5). An unknown name
  renders as a blank button.
- If this repo is the workspace: it is public — don't commit generated files that
  contain the user's local paths.

## 1. Locate the library

The app stores its settings in its app-data folder:

| OS | Settings file |
|---|---|
| Windows | `%APPDATA%\tta-gmsb-downloader\settings.json` |
| macOS | `~/Library/Application Support/tta-gmsb-downloader/settings.json` |
| Linux | `~/.config/tta-gmsb-downloader/settings.json` |

`settings.json` → `downloadFolder` is the library root. The same app-data folder also
holds cached copies of the TTA metadata (`tta_data.cache.json`, `tags_data.cache.js`),
which may be stale — prefer fetching live (section 3).

Library folder layout:

```
<downloadFolder>/
  gmsb-library.json          GMSB import document (app-owned)
  .tta-gmsb-ledger.json      download ledger, hidden dotfile (app-owned)
  gmsb-scene-pages.json      example of generated shortcut pages (see section 5)
  Full/  Music Only/  Additional Music Only/  Ambient Only/  Additional Ambient/  Other/
  SoundPads/<Board Name>/    sounds extracted from TTA SoundPad boards
```

## 2. Library files

### `gmsb-library.json` — GMSB import document (Schema 3)

```jsonc
{
  "Schema": 3,
  "ExportedAt": "2026-10-05T03:30:05.000Z",
  "Buses": [ { "Id": 1, "Name": "Music", "Order": 0, "Color": null, "IsBuiltIn": true, "Volume": 1 },
             { "Id": 2, "Name": "Ambient", ... }, { "Id": 3, "Name": "SFX", ... } ],
  "Tracks": [
    { "Id": 53, "Name": "Raven Queen (Music Only)",
      "FilePath": "<absolute path>\\Music Only\\515_Raven_Queen_MUS_Only.mp3",
      "Tags": "type:music_only, category:background, genre:fantasy, mood:mysterious, biome:forest",
      "Volume": 1, "IsLooping": true, "BusId": 1 }
  ],
  "Presets": [], "Playlists": [],
  "ShortcutPages": [ { "Name": "Cthulhu", "OrderIndex": 0, "Buttons": [ ... ] } ]
}
```

`Tags` is one comma-separated string. Vocabulary written by the app:

| Tag | Meaning |
|---|---|
| `type:full` / `music_only` / `additional_music_only` / `ambient` / `additional_ambient` / `other` | variant of a TTA track (see below) |
| `type:sfx` / `type:music` / `type:ambient` + `soundpad:<slug>` | a sound extracted from a SoundPad board |
| `category:background` / `category:event` | looping bed vs. one-shot |
| `genre:<fantasy\|scifi\|historical\|modern\|nature\|horror>` | TTA genre |
| `civ:` `biome:` `mood:` `action:` `<key>` | TTA's curated "More filters" categories (section 3) |
| `alt:<descriptor>` | extra filename tokens, e.g. `alt:no_queen`, `alt:redo_2025` |
| bare words (`forest`, `battle`, …) | TTA's free-form keyword tags |

Buses: **Music = 1, Ambient = 2, SFX = 3**.

### `.tta-gmsb-ledger.json` — what has been downloaded

```jsonc
{
  "entries": [
    { "fileId": "patreon:515_Raven_Queen_MUS_Only.mp3",
      "fileName": "515_Raven_Queen_MUS_Only.mp3",
      "relativePath": "Music Only/515_Raven_Queen_MUS_Only.mp3",
      "variant": "music_only", "baseType": "music_only", "altDescriptor": null,
      "source": "patreon", "manifestKey": null, "trackNumber": 515,
      "title": "Raven Queen", "gmsbTrackId": 53 },
    { "...": "...", "soundpad": "cthulhu", "padType": "sfx" }
  ],
  "pads":  [ { "slug": "cthulhu", "name": "Cthulhu", "postId": "...", "downloadedAt": "..." } ],
  "packs": [ { "packId": "pack:<postId>:<archive>", "name": "...", "postId": "...", "downloadedAt": "..." } ]
}
```

- `gmsbTrackId` equals `Tracks[].Id` in `gmsb-library.json` — use it to link the two.
- **Join key to TTA metadata: `trackNumber ?? manifestKey`.** `manifestKey` is null for
  tracks downloaded before TTA listed them publicly (Patreon publishes first), but
  `trackNumber` (the numeric filename prefix) is usually set.
- Entries with `soundpad` are SoundPad sounds: they have no TTA track metadata — use
  `soundpad` (board slug) and `padType` (`sfx` one-shot, `music`/`ambient` loop).
- **Variant rules.** `baseType` is the stem: `full`, `music_only` (`MUS_Only`,
  `Music_Only`, `No_Amb`) or `ambient` (`AMB_Only`, `Ambience_Only`, `No_Mus`). If
  `altDescriptor` contains an isolation token (`no`, `min`, `minimal`, as in
  `no_queen`), the bucket becomes `additional_music` / `additional_ambient`, or
  `other` for a full mix. Version markers (`redo_2025`, `night_ver`) do not change
  the bucket. The stored `variant` may be stale for files downloaded by older app
  versions — recompute it from `baseType` + `altDescriptor` with these rules.

## 3. TTA metadata (authoritative for categorization)

### Track manifest — `https://tabletopaudio.com/tta_data`

JSON `{ "tracks": [ ... ] }`, ~530 tracks:

```jsonc
{ "key": 514, "track_title": "Millhaven", "track_type": "ambience + music",
  "track_genre": ["music", "fantasy", "historical"],
  "flavor_text": "Like a gentle giant looming over a sleepy town...",
  "link": "https://sounds.tabletopaudio.com/514_Millhaven.mp3",
  "small_image": "...", "large_image": "...", "new": "true",
  "tags": ["village", "town", "windmill", "market", "river", "lake", "city", "medieval"] }
```

- `key` is the track number (the join key).
- `track_genre` mixes genres with type markers: drop `music`/`ambience`/`ambient`,
  and **split on commas** — some entries are a single `"fantasy, historical"` string.
- `track_type` values include `ambience + music`, `music + ambience`,
  `ambience + minimal music`, `music`, `ambience`. **Pure `music` / `ambience` tracks
  have no separate stem — their full file *is* the music-only / ambient-only version.**
- `flavor_text` is a useful one-line scene description for categorization.

### Curated categories — `https://tabletopaudio.com/bootstrap/js/tags_data.js`

The website's "More filters" menus. It is **JavaScript, not JSON**:
`var useCaseTags = { "514": { civ: ["cities"], biome: ["water"], mood: ["peaceful"], action: [] }, ... };`
with `//` comments, unquoted keys, and occasional stray commas. Normalize before
parsing (see the script in section 4).

| Category | Keys → website label |
|---|---|
| `civ` | cities Cities & Towns · outposts Camps & Outposts · public Public Spaces & Markets · interiors Interiors & Rooms · roads Roads & Travel · transit Transit & Stations · facilities Facilities, Labs & Bases · ruins Ruins & Pillaged · slums Slums & Underbelly · temples Temples & Magical |
| `biome` | forest Forest & Jungle · desert Desert & Desolate · ice Ice & Snow · mountains Mountains & Plains · swamp Swamp & Marsh · underground Underground · water Water & Underwater · weather Storms & Weather · planar Otherworldly & Planar · hellscape Hellscape & Lava |
| `mood` | peaceful Peaceful & Tranquil · optimistic Optimistic & Awe · fun Lighthearted & Fun · somber Reflective & Somber · dramatic Dramatic & Serious · tension Tension & Looming · mysterious Mysterious & Unsettling · epic Epic & Intense |
| `action` | explore Explore & Journey · investigate Investigate & Plan · celebrate Celebrate & Festival · ritual Ritual & Magic · sneak Sneak & Track · chase Chase & Escape · skirmish Skirmish & Brawl · monster Monster Encounter · war Large Battle & War · boss Boss Battle |

## 4. Build a joined index first

Before categorizing, build one row per downloaded file that joins the library, the
ledger, and the live metadata. Node 18+ (no dependencies) — save as
`inspect-library.mjs` in your workspace and run `node inspect-library.mjs`:

```js
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const appData =
  process.platform === 'win32' ? process.env.APPDATA
  : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
  : (process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'))
const { downloadFolder } = JSON.parse(
  fs.readFileSync(path.join(appData, 'tta-gmsb-downloader', 'settings.json'), 'utf8'))
const read = (f) => JSON.parse(fs.readFileSync(path.join(downloadFolder, f), 'utf8'))
const library = read('gmsb-library.json')
const ledger = read('.tta-gmsb-ledger.json')

const manifest = (await (await fetch('https://tabletopaudio.com/tta_data')).json()).tracks
const js = await (await fetch('https://tabletopaudio.com/bootstrap/js/tags_data.js')).text()
const useCase = JSON.parse(js.match(/useCaseTags\s*=\s*(\{[\s\S]*\})\s*;/)[1]
  .replace(/\/\/[^\n]*/g, '')                          // comments
  .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":')  // quote bare keys
  .replace(/\[\s*,/g, '[').replace(/,\s*,/g, ',')      // stray commas
  .replace(/,(\s*[}\]])/g, '$1'))                      // trailing commas

const byKey = new Map(manifest.map((t) => [t.key, t]))
const trackById = new Map(library.Tracks.map((t) => [t.Id, t]))
const NON_GENRE = new Set(['music', 'ambience', 'ambient'])

const rows = ledger.entries.map((e) => {
  const n = e.trackNumber ?? e.manifestKey
  const m = n != null ? byKey.get(n) : undefined
  const uc = (n != null && useCase[String(n)]) || {}
  const t = trackById.get(e.gmsbTrackId)
  return {
    trackId: e.gmsbTrackId, name: t?.Name ?? e.title, filePath: t?.FilePath,
    number: n, title: m?.track_title ?? e.title, flavor: m?.flavor_text,
    baseType: e.baseType, altDescriptor: e.altDescriptor ?? null,
    soundpad: e.soundpad ?? null, padType: e.padType ?? null,
    trackType: m?.track_type ?? null,
    genres: (m?.track_genre ?? []).flatMap((g) => g.split(',').map((s) => s.trim().toLowerCase()))
      .filter((g) => g && !NON_GENRE.has(g)),
    tags: m?.tags ?? [],
    civ: uc.civ ?? [], biome: uc.biome ?? [], mood: uc.mood ?? [], action: uc.action ?? []
  }
})
fs.writeFileSync('library-index.json', JSON.stringify(rows, null, 2))
console.log(`${rows.length} rows → library-index.json`)
```

Query `library-index.json` for the request (e.g. "ambient-only forest tracks with a
tense mood", "everything tagged `action:boss`").

## 5. Producing GMSB shortcut pages

### Import document

Write a new Schema 3 document. **Copy each referenced track verbatim from
`gmsb-library.json`** (same `Id`, `Name`, `FilePath`, `Tags`, `Volume`, `IsLooping`,
`BusId`): GMSB matches tracks by resolved `FilePath`, reuses the existing track, and
leaves it untouched. Every button's `TrackId` must refer to a track in the document.

```jsonc
{
  "Schema": 3, "ExportedAt": "<ISO-8601 UTC>",
  "Buses": [ /* copy the three built-ins from gmsb-library.json */ ],
  "Tracks": [ /* only the referenced tracks, copied verbatim */ ],
  "Presets": [], "Playlists": [],
  "ShortcutPages": [
    { "Name": "Calm", "OrderIndex": 0, "Buttons": [
      { "Label": "Forest: Day (Ambient Only)", "Icon": "ra-pine-tree",
        "IconColor": "#FFFFFF", "ButtonColor": "#2E7D32",
        "Row": 0, "Column": 0, "TrackId": 1234 } ] }
  ]
}
```

Button fields: `Label`, `Icon` (RPG Awesome class), `IconColor` and `ButtonColor`
(hex `#RRGGBB` or `#AARRGGBB`), `Row`, `Column`, `TrackId`, optional `BusIdOverride`.

- **Layout:** GMSB renders buttons as 120 px tiles in a wrapping panel, ordered by
  `Row` then `Column` — it is not a fixed grid. Use `Row` = sequence index and
  `Column` = 0, and group related buttons by placing them next to each other.
- **Icons:** must be a name from the GMSB icon list —
  `SoundBoard.UI/Controls/RpgAwesomeIcons.cs` in
  [game-master-soundboard](https://github.com/DevinSanders/game-master-soundboard)
  (495 `["ra-…"]` entries; the repo may also be checked out locally as a sibling
  folder). Common guesses that **don't exist**: `ra-sword`, `ra-ghost`, `ra-tree`,
  `ra-music`, `ra-castle`, `ra-cave-entrance`.
- **Page names:** if a page with the same name exists, the import's duplicate policy
  decides (Skip keeps the existing page, Replace overwrites it, Allow Duplicates
  renames the new one). Use distinct names unless a replacement is intended.
- **Validate before handing off:** every `TrackId` resolves, every icon is in the
  list, every color is valid hex, no duplicate button for the same track on a page.
- The user imports via **GMSB → Library → Import → merge into the active library**.

### Conventions already in use (`gmsb-scene-pages.json`)

Keep new pages consistent with these unless the user asks otherwise:

- **Mood pages:** Calm (`peaceful`), Joyful (`optimistic` + `fun`), Somber, Mysterious,
  Tense (`tension`), Dramatic, Epic. One Music Only + one Ambient Only button per
  track (prefer the stem with no `altDescriptor`); a track appears on every page whose
  mood it carries.
- **`ButtonColor` = scene (first `biome`):** forest `#2E7D32`, swamp `#33691E`,
  water `#1565C0`, ice `#4FC3F7`, mountains/pasture `#C9A227`, desert `#C68642`,
  underground `#5D4037`, weather `#546E7A`, planar `#7E57C2`, hellscape `#C62828`.
  No biome → by subject: sci-fi `#00838F`, battle `#AD1457`, settlement `#607D8B`,
  otherwise `#455A64`.
- **`IconColor`:** `#212121` on light buttons (luminance > 0.6), else `#FFFFFF`.
- **`Icon` = subject first, then scene:** dragon `ra-dragon`, undead/ghost
  `ra-death-skull`, monster `ra-monster-skull`, wolf `ra-wolf-head`, alien
  `ra-alien-fire`, tech/facility `ra-cog`, space `ra-satellite`, magic/ritual
  `ra-crystal-ball`, battle/weapons `ra-crossed-swords`, ship `ra-ship-emblem`,
  horse `ra-horseshoe`, royal `ra-crown`, tavern/festival `ra-beer`; otherwise by
  biome: forest `ra-pine-tree`, water/swamp `ra-water-drop`, mountains
  `ra-mountains`, desert `ra-pyramids`, ice `ra-snowflake`, underground
  `ra-mine-wagon`, weather `ra-lightning-bolt`, hellscape `ra-fire`, planar/default
  `ra-aura`.
- **Order on a page:** by scene group (forest, swamp, water, ice, mountains, desert,
  underground, weather, hellscape, planar, settlement, battle, sci-fi, other), then
  title, Music Only before Ambient Only.

## Known gaps

- Library `Tags` may lack `genre:`/`mood:`/`biome:` for tracks whose ledger
  `manifestKey` is null (e.g. #515 Raven Queen) if the library was generated by an
  app version before 0.1.2. **Rebuild library** in the app (0.1.2+) fills them in from
  the track number; either way, treat the joined index as authoritative.
- Tracks published on Patreon before the public site may be missing from `tta_data`
  (no title/genre/tags); `tags_data.js` often still has their categories by number.
- Some filenames carry letter-suffixed numbers (`204a_…`) or none at all; these have
  no `trackNumber` and no TTA metadata — categorize from the filename and ask the user
  when unsure.
- SoundPad sounds have only `soundpad` + `padType`; the board itself already has its
  own shortcut page in the library.
