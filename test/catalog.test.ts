import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseManifest } from '../src/main/manifest'
import { indexManifest } from '../src/main/matcher'
import { assembleCatalog, relativePathFor, variantFolder } from '../src/main/catalog'
import type { RawPack, RawPatreonFile, RawSoundpad } from '../src/main/patreon'
import type { TtaManifestTrack } from '@shared/manifest'
import { emptyLedger } from '@shared/ledger'

const realTracks = parseManifest(
  readFileSync(resolve(import.meta.dirname, 'fixtures/tta_data.json'), 'utf8')
)
const idx = indexManifest(realTracks)
const millhaven = realTracks.find((t) => t.key === 514)!

const now = new Date('2026-06-26T00:00:00Z')

function group(catalog: ReturnType<typeof assembleCatalog>, num: number) {
  return catalog.tracks.find((t) => t.number === num)
}

describe('variant folders', () => {
  it('maps variants to folders and POSIX relative paths', () => {
    expect(variantFolder('full')).toBe('Full')
    expect(variantFolder('ambient')).toBe('Ambient Only')
    expect(relativePathFor({ variant: 'music_only', fileName: '514_Millhaven_MUS_Only.mp3' })).toBe(
      'Music Only/514_Millhaven_MUS_Only.mp3'
    )
  })
})

describe('assembleCatalog', () => {
  const patreon: RawPatreonFile[] = [
    { fileName: '514_Millhaven.mp3', url: 'https://p/x1', postId: 'p514', canView: true }, // dup of public Full
    { fileName: '514_Millhaven_MUS_Only.mp3', url: 'https://p/x2', postId: 'p514', canView: true },
    { fileName: '514_Millhaven_AMB_Only.mp3', url: 'https://p/x3', postId: 'p514', canView: true },
    { fileName: '514_Millhaven_AMB_Only_No_Wind.mp3', url: 'https://p/x4', postId: 'p514', canView: true },
    // a brand-new, not-yet-in-manifest track, locked for this account
    { fileName: '9001_New_Track_AMB_Only.mp3', url: 'https://p/x5', postId: 'p9001', canView: false }
  ]

  it('provides a public Full for every manifest track', () => {
    const cat = assembleCatalog(realTracks, idx, [], [], {}, emptyLedger('/dl'), now)
    const g = group(cat, 514)!
    expect(g.files).toHaveLength(1)
    expect(g.files[0].source).toBe('public')
    expect(g.files[0].variant).toBe('full')
    expect(cat.hasPatreonAccess).toBe(false)
  })

  it('merges Patreon alternates and dedupes the Full', () => {
    const cat = assembleCatalog(realTracks, idx, patreon, [], {}, emptyLedger('/dl'), now)
    const g = group(cat, 514)!
    const byVariant = g.files.reduce<Record<string, number>>((acc, f) => {
      acc[f.variant] = (acc[f.variant] ?? 0) + 1
      return acc
    }, {})
    // 1 Full (public; patreon Full deduped), 1 music, 1 ambient, and the
    // AMB_Only_No_Wind isolation as 1 Additional Ambient.
    expect(byVariant).toEqual({ full: 1, music_only: 1, ambient: 1, additional_ambient: 1 })
    expect(g.files.find((f) => f.variant === 'full')!.source).toBe('public')
    expect(cat.hasPatreonAccess).toBe(true)
    expect(g.title).toBe('Millhaven')
  })

  it('creates a key-less group for not-yet-in-manifest tracks and flags locked', () => {
    const cat = assembleCatalog(realTracks, idx, patreon, [], {}, emptyLedger('/dl'), now)
    const g = group(cat, 9001)!
    expect(g.key).toBeNull()
    expect(g.files).toHaveLength(1)
    expect(g.files[0].locked).toBe(true)
    expect(g.files[0].variant).toBe('ambient')
  })

  it('flags already-downloaded files from the ledger', () => {
    const led = emptyLedger('/dl')
    led.entries.push({
      fileId: 'patreon:514_Millhaven_MUS_Only.mp3',
      fileName: '514_Millhaven_MUS_Only.mp3',
      relativePath: 'Music Only/514_Millhaven_MUS_Only.mp3',
      variant: 'music_only',
      baseType: 'music_only',
      source: 'patreon',
      manifestKey: 514,
      trackNumber: 514,
      title: 'Millhaven',
      downloadedAt: now.toISOString(),
      gmsbTrackId: 1
    })
    const cat = assembleCatalog([millhaven], idx, patreon, [], {}, led, now)
    const g = group(cat, 514)!
    const mus = g.files.find((f) => f.fileName === '514_Millhaven_MUS_Only.mp3')!
    expect(mus.alreadyDownloaded).toBe(true)
    const amb = g.files.find((f) => f.variant === 'ambient')!
    expect(amb.alreadyDownloaded).toBe(false)
  })
})

describe('soundpads in catalog', () => {
  const pad: RawSoundpad = {
    postId: '137',
    title: 'SoundPad: Wuxia (Remastered)',
    name: 'Wuxia',
    slug: 'wuxia',
    archiveFileName: 'Wuxia SoundPad.zip',
    archiveUrl: 'https://p/wuxia.zip',
    isZip: true,
    canView: true
  }

  it('exposes pads with a selection id and grants access', () => {
    const cat = assembleCatalog([millhaven], idx, [], [pad], {}, emptyLedger('/dl'), now)
    expect(cat.soundpads).toHaveLength(1)
    expect(cat.soundpads[0].padId).toBe('pad:137')
    expect(cat.soundpads[0].alreadyDownloaded).toBe(false)
    expect(cat.hasPatreonAccess).toBe(true)
  })

  it('marks a pad already-downloaded from the ledger', () => {
    const led = emptyLedger('/dl')
    led.pads.push({ slug: 'wuxia', name: 'Wuxia', postId: '137', downloadedAt: now.toISOString() })
    const cat = assembleCatalog([millhaven], idx, [], [pad], {}, led, now)
    expect(cat.soundpads[0].alreadyDownloaded).toBe(true)
  })
})

describe('pure-music tracks and audio packs in catalog', () => {
  const anthem: TtaManifestTrack = {
    key: 900,
    track_title: 'Test Anthem',
    track_type: 'music',
    track_genre: [],
    link: 'https://sounds.tabletopaudio.com/900_Test_Anthem.mp3',
    tags: []
  }
  const aidx = indexManifest([anthem])
  const pf = (fileName: string): RawPatreonFile => ({ fileName, url: 'u', postId: 'p900', canView: true })

  it('lists the public file of a pure-music track as Music Only', () => {
    const cat = assembleCatalog([anthem], aidx, [], [], {}, emptyLedger('/dl'), now)
    const f = group(cat, 900)!.files[0]
    expect(f.variant).toBe('music_only')
    expect(f.displayName).toBe('Test Anthem (Music Only)')
  })

  it('dedupes a higher-bitrate copy but keeps a different version', () => {
    const cat = assembleCatalog(
      [anthem],
      aidx,
      [pf('900_Test_Anthem_320.mp3'), pf('900_Test_Anthem_Redo_2025.mp3')],
      [],
      {},
      emptyLedger('/dl'),
      now
    )
    const files = group(cat, 900)!.files
    expect(files.map((f) => f.source + ':' + (f.altDescriptor ?? ''))).toEqual(['public:', 'patreon:redo_2025'])
  })

  it('exposes audio packs and flags downloaded ones from the ledger', () => {
    const pack: RawPack = {
      postId: 'p1',
      title: 'New Ambiences: Distilled',
      name: 'Distilled — Distilled-Audio1',
      archiveFileName: 'Distilled-Audio1.zip',
      archiveUrl: 'u',
      isZip: true,
      canView: true
    }
    const fresh = assembleCatalog([anthem], aidx, [], [], {}, emptyLedger('/dl'), now, [pack])
    expect(fresh.packs.map((p) => p.padId)).toEqual(['pack:p1:Distilled-Audio1.zip'])
    expect(fresh.packs[0].alreadyDownloaded).toBe(false)

    const led = emptyLedger('/dl')
    led.packs!.push({ packId: 'pack:p1:Distilled-Audio1.zip', name: pack.name, postId: 'p1', downloadedAt: now.toISOString() })
    const done = assembleCatalog([anthem], aidx, [], [], {}, led, now, [pack])
    expect(done.packs[0].alreadyDownloaded).toBe(true)
  })
})

describe('use-case tags in catalog', () => {
  it('attaches Civilization/Biome/Mood/Action tags to a track by key', () => {
    const useCase = {
      '514': { civ: ['cities'], biome: ['water'], mood: ['peaceful'], action: [] }
    }
    const cat = assembleCatalog([millhaven], idx, [], [], useCase, emptyLedger('/dl'), now)
    const g = group(cat, 514)!
    expect(g.useCase.mood).toEqual(['peaceful'])
    expect(g.useCase.biome).toEqual(['water'])
    expect(g.useCase.civ).toEqual(['cities'])
  })
})
