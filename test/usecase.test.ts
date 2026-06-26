import { describe, it, expect } from 'vitest'
import { parseUseCaseTags } from '../src/main/usecase'
import { USECASE_OPTIONS } from '@shared/usecase'

describe('parseUseCaseTags', () => {
  // Mirrors the quirks in the real tags_data.js: // comments, unquoted keys,
  // and a stray leading comma in an array.
  const sample = `
    //Complete list of tags used below
    var useCaseTags = {
      "514": { // Millhaven
        civ: ["cities"],
        biome: ["water"],
        mood: ["peaceful"],
        action: []
      },
      "515": { // Raven Queen
        civ: [],
        biome: ["forest"],
        mood: ["mysterious","tension"],
        action: [,"ritual","monster"]
      }
    };
  `

  it('parses comments, unquoted keys and stray commas', () => {
    const map = parseUseCaseTags(sample)
    expect(Object.keys(map)).toEqual(['514', '515'])
    expect(map['514']).toEqual({ civ: ['cities'], biome: ['water'], mood: ['peaceful'], action: [] })
    expect(map['515'].mood).toEqual(['mysterious', 'tension'])
    expect(map['515'].action).toEqual(['ritual', 'monster'])
  })
})

describe('use-case taxonomy', () => {
  it('labels match the site menu', () => {
    expect(USECASE_OPTIONS.mood.peaceful).toBe('Peaceful & Tranquil')
    expect(USECASE_OPTIONS.biome.forest).toBe('Forest & Jungle')
    expect(USECASE_OPTIONS.civ.cities).toBe('Cities & Towns')
    expect(USECASE_OPTIONS.action.boss).toBe('Boss Battle')
  })
})
