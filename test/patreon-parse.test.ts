import { describe, it, expect } from 'vitest'
import { flattenPage } from '../src/main/patreon-parse'

/** Build a JSON:API page from [postTitle, fileNames[]] pairs. */
function page(...posts: Array<[string, string[]]>): unknown {
  const data: unknown[] = []
  const included: unknown[] = []
  posts.forEach(([title, files], i) => {
    const refs = files.map((f, j) => {
      const id = `m${i}_${j}`
      included.push({ type: 'media', id, attributes: { file_name: f, download_url: `https://cdn/${id}` } })
      return { type: 'media', id }
    })
    data.push({
      id: `p${i}`,
      attributes: { title, current_user_can_view: true },
      relationships: { media: { data: refs } }
    })
  })
  return { data, included }
}

describe('flattenPage — soundpad detection', () => {
  it('detects a "SoundPad Remaster:" post and names it from the title', () => {
    const { pads, files, packs } = flattenPage(
      page(['SoundPad Remaster: Combat:Future', ['Combat Future SoundPad.zip', 'cover.jpg']])
    )
    expect(pads).toHaveLength(1)
    expect(pads[0].name).toBe('Combat:Future')
    expect(pads[0].slug).toBe('combat-future')
    expect(files).toHaveLength(0)
    expect(packs).toHaveLength(0)
  })

  it('detects a board by its "*SoundPad.zip" archive even with an unusual title', () => {
    const { pads } = flattenPage(page(['Big Remaster Day', ['Sky Castle SoundPad.zip']]))
    expect(pads.map((p) => p.name)).toEqual(['Sky Castle'])
  })

  it('excludes loose preview MP3s from SoundPad Preview posts', () => {
    const { pads, files } = flattenPage(
      page(
        ['New SoundPad Preview: Weirder Things', ['weirder_thing-drama.mp3', 'weirder_things-dawn.mp3']],
        ['Film Noir SoundPad Preview', ['noir_theme.mp3']]
      )
    )
    expect(files).toHaveLength(0)
    expect(pads).toHaveLength(0)
  })
})

describe('flattenPage — audio packs', () => {
  it('turns track zips in a regular post into packs, one per archive', () => {
    const { packs, pads } = flattenPage(
      page(['New Ambiences: Distilled: A Spirited Strategy Game', ['Distilled-Audio1.zip', 'Distilled-Audio2.zip']])
    )
    expect(pads).toHaveLength(0)
    expect(packs.map((p) => p.name)).toEqual([
      'Distilled: A Spirited Strategy Game — Distilled-Audio1',
      'Distilled: A Spirited Strategy Game — Distilled-Audio2'
    ])
    expect(packs.every((p) => p.isZip)).toBe(true)
  })

  it('keeps music zips but skips maps/minis/docs bundled in the same post', () => {
    const { packs } = flattenPage(
      page([
        'Behold the Tarrasque!',
        ['Tarrasque_-_TabletopAudio_-_Music.zip', 'Tarrasque_-_FullOrganMap.zip', 'Tarrasque_-_PaperForge_-_Minis.zip', 'Tarrasque_-_DMDave_-_Adventure.pdf.zip']
      ])
    )
    expect(packs.map((p) => p.archiveFileName)).toEqual(['Tarrasque_-_TabletopAudio_-_Music.zip'])
  })

  it('ignores non-audio tool archives', () => {
    const { packs, pads, files } = flattenPage(
      page(['Elgato Stream Deck Control of Custom SoundPads: Super Early Test', ['WIN - Streamdeck Companion.zip']])
    )
    expect(packs).toHaveLength(0)
    expect(pads).toHaveLength(0)
    expect(files).toHaveLength(0)
  })

  it('lists a .rar pack as unsupported (isZip false)', () => {
    const { packs } = flattenPage(page(['New Ambience: Vault of Terror', ['Vault of Terror Pack.rar']]))
    expect(packs).toHaveLength(1)
    expect(packs[0].isZip).toBe(false)
  })

  it('still collects loose audio from regular posts', () => {
    const { files } = flattenPage(page(['New Ambience: Cry Havoc', ['171_Cry_Havoc_320.mp3', 'cover.jpg']]))
    expect(files.map((f) => f.fileName)).toEqual(['171_Cry_Havoc_320.mp3'])
  })
})
