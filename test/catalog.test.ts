import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseManifest } from '../src/main/manifest'
import { indexManifest } from '../src/main/matcher'
import { assembleCatalog, relativePathFor, variantFolder } from '../src/main/catalog'
import type { RawPatreonFile, RawSoundpad } from '../src/main/patreon'
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
