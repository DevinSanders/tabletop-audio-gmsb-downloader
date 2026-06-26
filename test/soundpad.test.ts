import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  slugify,
  padNameFromTitle,
  classifyPadSound,
  cleanSoundName,
  sanitizeFsName,
  extractPadZip
} from '../src/main/soundpad'

describe('soundpad helpers', () => {
  it('derives the pad name from a post title', () => {
    expect(padNameFromTitle('SoundPad: Wuxia (Remastered)')).toBe('Wuxia')
    expect(padNameFromTitle('New SoundPad: Sanctum')).toBe('Sanctum')
    expect(padNameFromTitle('SoundPad: House on the Hill')).toBe('House on the Hill')
  })

  it('slugifies pad names', () => {
    expect(slugify('Age of Sail')).toBe('age-of-sail')
    expect(slugify('Wuxia (Remastered)')).toBe('wuxia')
  })

  it('classifies pad sounds by name (mirrors the seeder)', () => {
    expect(classifyPadSound('Music_Awaken.ogg')).toEqual({ padType: 'music', looping: true })
    expect(classifyPadSound('Rain_On_Window_Loop.ogg')).toEqual({ padType: 'ambient', looping: true })
    expect(classifyPadSound('Door_Force_Open.ogg')).toEqual({ padType: 'sfx', looping: false })
  })

  it('cleans a sound file name into a label', () => {
    expect(cleanSoundName('Door_Force_Open.ogg')).toBe('Door Force Open')
  })

  it('sanitizes path-illegal characters', () => {
    expect(sanitizeFsName('Combat: Siege')).toBe('Combat Siege')
    expect(sanitizeFsName('a/b\\c|d?e*')).toBe('a b c d e')
    expect(sanitizeFsName('trailing dot.')).toBe('trailing dot')
  })
})

describe('extractPadZip', () => {
  it('writes audio entries (incl. nested), skipping images and __MACOSX', async () => {
    const zip = zipSync({
      'Foghorn.ogg': strToU8('a'),
      'Music_Awaken.mp3': strToU8('bb'),
      'cover.jpg': strToU8('img'),
      '__MACOSX/._x.ogg': strToU8('junk'),
      'nested/Door_Open.wav': strToU8('ccc')
    })
    const dir = await fs.mkdtemp(join(tmpdir(), 'tta-pad-'))
    const sounds = await extractPadZip(zip, dir, 'Cthulhu')

    expect(sounds.map((s) => s.fileName)).toEqual([
      'Door_Open.wav',
      'Foghorn.ogg',
      'Music_Awaken.mp3'
    ])
    for (const s of sounds) {
      const abs = join(dir, ...s.relativePath.split('/'))
      await expect(fs.stat(abs)).resolves.toBeTruthy()
    }
    expect(sounds.find((s) => s.fileName === 'Music_Awaken.mp3')!.padType).toBe('music')
    expect(sounds[0].relativePath).toBe('SoundPads/Cthulhu/Door_Open.wav')
  })

  it('writes pads with path-illegal names to a sanitized folder', async () => {
    const zip = zipSync({ 'Siege_Loop.ogg': strToU8('a') })
    const dir = await fs.mkdtemp(join(tmpdir(), 'tta-pad-'))
    const sounds = await extractPadZip(zip, dir, 'Combat: Siege')
    expect(sounds[0].relativePath).toBe('SoundPads/Combat Siege/Siege_Loop.ogg')
    await expect(fs.stat(join(dir, 'SoundPads', 'Combat Siege', 'Siege_Loop.ogg'))).resolves.toBeTruthy()
  })
})
