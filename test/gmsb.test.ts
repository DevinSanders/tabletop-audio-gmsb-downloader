import { readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, isAbsolute } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseManifest } from '../src/main/manifest'
import { indexManifest } from '../src/main/matcher'
import { buildLibraryDocument, buildTags } from '../src/main/gmsb'
import { readLedger, writeLedger, newFileIds, allocateTrackId, upsertEntry } from '../src/main/ledger'
import { emptyLedger, type LedgerEntry } from '@shared/ledger'

const realTracks = parseManifest(
  readFileSync(resolve(import.meta.dirname, 'fixtures/tta_data.json'), 'utf8')
)
const idx = indexManifest(realTracks)

function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return {
    fileId: 'patreon:514_Millhaven_AMB_Only.mp3',
    fileName: '514_Millhaven_AMB_Only.mp3',
    relativePath: 'Ambient Only/514_Millhaven_AMB_Only.mp3',
    variant: 'ambient',
    baseType: 'ambient',
    source: 'patreon',
    manifestKey: 514,
    trackNumber: 514,
    title: 'Millhaven',
    downloadedAt: '2026-06-26T00:00:00.000Z',
    gmsbTrackId: 1,
    ...over
  }
}

describe('buildTags', () => {
  it('emits the GMSB tag convention with genres and manifest tags', () => {
    const tags = buildTags(entry({}), idx, {})
    expect(tags).toContain('type:ambient')
    expect(tags).toContain('category:background')
    // Millhaven manifest genres include fantasy/historical (music is filtered out).
    expect(tags).toContain('genre:fantasy')
    expect(tags).not.toContain('genre:music')
    // a manifest free tag
    expect(tags).toMatch(/\b(village|town|market|river)\b/)
  })

  it('adds alt: tag for isolation variants', () => {
    const tags = buildTags(entry({ variant: 'other', altDescriptor: 'no_queen' }), idx, {})
    expect(tags).toContain('alt:no_queen')
  })

  it('adds use-case tags (mood/biome/civ/action) from the map', () => {
    const useCase = { '514': { civ: ['cities'], biome: ['water'], mood: ['peaceful'], action: ['ritual'] } }
    const tags = buildTags(entry({}), idx, useCase)
    expect(tags).toContain('mood:peaceful')
    expect(tags).toContain('biome:water')
    expect(tags).toContain('civ:cities')
    expect(tags).toContain('action:ritual')
  })
})

describe('buildLibraryDocument', () => {
  const ledger = emptyLedger('/dl')
  ledger.entries = [
    entry({ gmsbTrackId: 2, fileId: 'b' }),
    entry({ gmsbTrackId: 1, fileId: 'a', variant: 'full', baseType: 'full', relativePath: 'Full/514_Millhaven.mp3' })
  ]
  const downloadFolder = process.platform === 'win32' ? 'C:\\dl' : '/dl'
  const doc = buildLibraryDocument(ledger, idx, {}, downloadFolder, new Date('2026-06-26T12:00:00Z'))

  it('produces a Schema 2 document with empty collections', () => {
    expect(doc.Schema).toBe(2)
    expect(doc.Presets).toEqual([])
    expect(doc.Playlists).toEqual([])
    expect(doc.ShortcutPages).toEqual([])
    expect(doc.ExportedAt).toBe('2026-06-26T12:00:00.000Z')
  })

  it('sorts tracks by stable Id and writes absolute native paths', () => {
    expect(doc.Tracks.map((t) => t.Id)).toEqual([1, 2])
    for (const t of doc.Tracks) {
      expect(isAbsolute(t.FilePath)).toBe(true)
      expect(t.Volume).toBe(1.0)
      expect(t.IsLooping).toBe(true)
    }
  })

  it('names full vs variant tracks distinctly', () => {
    expect(doc.Tracks[0].Name).toBe('Millhaven')
    expect(doc.Tracks[1].Name).toBe('Millhaven (Ambient Only)')
  })

  it('routes tracks to buses by stem (full->Music, ambient->Ambient)', () => {
    expect(doc.Tracks[0].BusId).toBe(1) // full -> Music
    expect(doc.Tracks[1].BusId).toBe(2) // ambient -> Ambient
  })
})

describe('soundpad ShortcutPages', () => {
  const now = new Date('2026-06-26T00:00:00Z')
  const led = emptyLedger('/dl')
  led.pads.push({ slug: 'cthulhu', name: 'Cthulhu', postId: '1', downloadedAt: now.toISOString() })
  led.entries.push(
    entry({
      fileId: 'pad:cthulhu:Foghorn.ogg',
      fileName: 'Foghorn.ogg',
      relativePath: 'SoundPads/Cthulhu/Foghorn.ogg',
      soundpad: 'cthulhu',
      padType: 'sfx',
      baseType: 'full',
      gmsbTrackId: 11,
      title: 'Foghorn',
      manifestKey: null,
      trackNumber: null
    }),
    entry({
      fileId: 'pad:cthulhu:Breeze_Loop.ogg',
      fileName: 'Breeze_Loop.ogg',
      relativePath: 'SoundPads/Cthulhu/Breeze_Loop.ogg',
      soundpad: 'cthulhu',
      padType: 'ambient',
      baseType: 'full',
      gmsbTrackId: 10,
      title: 'Breeze',
      manifestKey: null,
      trackNumber: null
    })
  )
  const doc = buildLibraryDocument(led, idx, {}, '/dl', now)

  it('creates one page per pad with a button per sound', () => {
    expect(doc.ShortcutPages).toHaveLength(1)
    const page = doc.ShortcutPages[0]
    expect(page.Name).toBe('Cthulhu')
    expect(page.Buttons).toHaveLength(2)
    // sorted by file name: Breeze_Loop before Foghorn
    expect(page.Buttons[0].TrackId).toBe(10)
    expect(page.Buttons[0].Row).toBe(0)
    expect(page.Buttons[1].TrackId).toBe(11)
  })

  it('tags and loops pad sounds by type', () => {
    const foghorn = doc.Tracks.find((t) => t.Name === 'Foghorn')!
    expect(foghorn.Tags).toContain('type:sfx')
    expect(foghorn.Tags).toContain('soundpad:cthulhu')
    expect(foghorn.IsLooping).toBe(false)
    const breeze = doc.Tracks.find((t) => t.Name === 'Breeze')!
    expect(breeze.IsLooping).toBe(true)
  })

  it('routes pad sounds to buses by pad type (sfx->SFX, ambient->Ambient)', () => {
    expect(doc.Tracks.find((t) => t.Name === 'Foghorn')!.BusId).toBe(3) // SFX
    expect(doc.Tracks.find((t) => t.Name === 'Breeze')!.BusId).toBe(2) // Ambient
  })
})

describe('ledger round-trip + dedup', () => {
  it('persists, reloads, and computes only-new selections', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'tta-ledger-'))
    const led = emptyLedger(dir)
    const id = allocateTrackId(led)
    expect(id).toBe(1)
    upsertEntry(led, entry({ gmsbTrackId: id, fileId: 'patreon:514_Millhaven.mp3' }))
    await writeLedger(dir, led)

    const reloaded = await readLedger(dir)
    expect(reloaded.entries).toHaveLength(1)
    expect(reloaded.nextGmsbTrackId).toBe(2)

    const fresh = newFileIds(reloaded, [
      'patreon:514_Millhaven.mp3', // already have
      'patreon:514_Millhaven_MUS_Only.mp3' // new
    ])
    expect(fresh).toEqual(['patreon:514_Millhaven_MUS_Only.mp3'])
  })

  it('returns an empty ledger when none exists', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'tta-ledger-'))
    const led = await readLedger(dir)
    expect(led.entries).toEqual([])
    expect(led.nextGmsbTrackId).toBe(1)
  })
})
