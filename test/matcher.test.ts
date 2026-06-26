import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseManifest } from '../src/main/manifest'
import { classifyFile, indexManifest, displayName, type ManifestIndex } from '../src/main/matcher'
import type { TtaManifestTrack } from '@shared/manifest'

const fixtureRaw = readFileSync(resolve(import.meta.dirname, 'fixtures/tta_data.json'), 'utf8')
const realTracks = parseManifest(fixtureRaw)

// 515 is not yet in the public manifest (Patreon leads it), so add a synthetic
// entry to exercise the cleanly-matched classification path.
const ravenQueen: TtaManifestTrack = {
  key: 515,
  track_title: 'Raven Queen',
  track_type: 'ambience + music',
  track_genre: ['music', 'fantasy'],
  link: 'https://sounds.tabletopaudio.com/515_Raven_Queen.mp3',
  tags: ['forest', 'queen']
}
const idx: ManifestIndex = indexManifest([...realTracks, ravenQueen])

describe('manifest', () => {
  it('parses the real fixture', () => {
    expect(realTracks.length).toBeGreaterThan(500)
    const t = realTracks.find((x) => x.key === 514)
    expect(t?.track_title).toBe('Millhaven')
    expect(Array.isArray(t?.tags)).toBe(true)
  })
})

describe('Raven Queen (#515) 7-file set', () => {
  // Stems with extra tokens go to their "additional" bucket; full-mix alternates
  // go to "other".
  const cases: Array<[string, string, string | undefined]> = [
    ['515_Raven_Queen.mp3', 'full', undefined],
    ['515_Raven_Queen_MUS_Only.mp3', 'music_only', undefined],
    ['515_Raven_Queen_AMB_Only.mp3', 'ambient', undefined],
    ['515_Raven_Queen_No_Queen.mp3', 'other', 'no_queen'],
    ['515_Raven_Queen_No_Queen_No_Ravens.mp3', 'other', 'no_queen_no_ravens'],
    ['515_Raven_Queen_AMB_Only_No_Queen.mp3', 'additional_ambient', 'no_queen'],
    ['515_Raven_Queen_AMB_Only_No_Queen_No_Ravens.mp3', 'additional_ambient', 'no_queen_no_ravens']
  ]

  for (const [file, variant, alt] of cases) {
    it(`${file} -> ${variant}`, () => {
      const c = classifyFile(file, idx)
      expect(c.trackNumber).toBe(515)
      expect(c.matched?.key).toBe(515)
      expect(c.variant).toBe(variant)
      expect(c.altDescriptor).toBe(alt)
    })
  }

  it('buckets to 1 Full, 1 Music, 1 Ambient, 2 Additional Ambient, 2 Other', () => {
    const counts: Record<string, number> = {}
    for (const [file] of cases) {
      const v = classifyFile(file, idx).variant
      counts[v] = (counts[v] ?? 0) + 1
    }
    expect(counts).toEqual({ full: 1, music_only: 1, ambient: 1, additional_ambient: 2, other: 2 })
  })

  it('base type is retained on isolation alternates', () => {
    expect(classifyFile('515_Raven_Queen_AMB_Only_No_Queen.mp3', idx).baseType).toBe('ambient')
    expect(classifyFile('515_Raven_Queen_No_Queen.mp3', idx).baseType).toBe('full')
  })

  it('builds readable display names', () => {
    expect(displayName(classifyFile('515_Raven_Queen.mp3', idx))).toBe('Raven Queen')
    expect(displayName(classifyFile('515_Raven_Queen_MUS_Only.mp3', idx))).toBe('Raven Queen (Music Only)')
    expect(displayName(classifyFile('515_Raven_Queen_AMB_Only_No_Queen.mp3', idx))).toBe(
      'Raven Queen (Ambient Only, No Queen)'
    )
  })
})

describe('casing and token variants', () => {
  it('accepts Music_Only and Ambience_Only spellings', () => {
    expect(classifyFile('515_Raven_Queen_Music_Only.mp3', idx).variant).toBe('music_only')
    expect(classifyFile('515_Raven_Queen_Ambience_Only.mp3', idx).variant).toBe('ambient')
    expect(classifyFile('515_raven_queen_amb_only.mp3', idx).variant).toBe('ambient')
  })

  it('does not misread a title word as a base type', () => {
    // A title containing "Music" without "Only" stays Full.
    const c = classifyFile('60s_Computer_Lab.mp3', idx)
    expect(c.variant).toBe('full')
  })

  it('treats a version marker (Redo 2025) as Music Only, not Additional', () => {
    const c = classifyFile('515_Raven_Queen_Music_Only_Redo_2025.mp3', idx)
    expect(c.baseType).toBe('music_only')
    expect(c.variant).toBe('music_only')
    expect(c.altDescriptor).toBe('redo_2025')
    expect(displayName(c)).toBe('Raven Queen (Music Only, Redo 2025)')
  })

  it('treats an isolation marker (No_Queen) on a music stem as Additional Music Only', () => {
    const c = classifyFile('515_Raven_Queen_Music_Only_No_Queen.mp3', idx)
    expect(c.variant).toBe('additional_music')
    expect(c.altDescriptor).toBe('no_queen')
  })
})

describe('real fixture matching', () => {
  it('matches a numbered file to its manifest entry', () => {
    const c = classifyFile('514_Millhaven_MUS_Only.mp3', idx)
    expect(c.matched?.key).toBe(514)
    expect(c.title).toBe('Millhaven')
    expect(c.variant).toBe('music_only')
  })

  it('classifies an unmatched (not-yet-in-manifest) file by filename alone', () => {
    const c = classifyFile('9001_Some_Brand_New_Track_AMB_Only_No_Wind.mp3', idx)
    expect(c.matched).toBeNull()
    expect(c.trackNumber).toBe(9001)
    expect(c.baseType).toBe('ambient')
    // ambient stem + isolation -> Additional Ambient
    expect(c.variant).toBe('additional_ambient')
    expect(c.altDescriptor).toBe('no_wind')
  })
})
