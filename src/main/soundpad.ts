import { unzipSync } from 'fflate'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const AUDIO_EXT = /\.(mp3|ogg|wav|flac|m4a|opus|aac)$/i

export type PadSoundType = 'sfx' | 'music' | 'ambient'

/** Slug for a pad, e.g. "Age of Sail" -> "age-of-sail". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(remastered\)/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Pad display name from a post title, e.g. "SoundPad: Wuxia (Remastered)" -> "Wuxia". */
export function padNameFromTitle(title: string): string {
  return title
    .replace(/^\s*new\s+/i, '')
    .replace(/^\s*soundpad:\s*/i, '')
    .replace(/\s*\(remastered\)\s*$/i, '')
    .trim()
}

/**
 * Classify a sound from a pad by filename, mirroring gmsb-seed-library's pad
 * heuristics: "music" -> music (loops), "_loop" -> ambient (loops), else a
 * one-shot sfx.
 */
export function classifyPadSound(fileName: string): { padType: PadSoundType; looping: boolean } {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '')
  if (/music/i.test(base)) return { padType: 'music', looping: true }
  if (/loop\d*/i.test(base)) return { padType: 'ambient', looping: true }
  return { padType: 'sfx', looping: false }
}

/**
 * Make a string safe as a single path segment on every OS. Strips characters
 * illegal on Windows (`< > : " / \ | ? *`), control chars, and trailing dots/
 * spaces, e.g. "Combat: Siege" -> "Combat Siege".
 */
export function sanitizeFsName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || 'untitled'
}

/** Readable label from a sound file name, e.g. "Door_Force_Open" -> "Door Force Open". */
export function cleanSoundName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return base
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export interface ExtractedSound {
  fileName: string
  /** POSIX path relative to the download root. */
  relativePath: string
  name: string
  padType: PadSoundType
  looping: boolean
  sizeBytes: number
}

/**
 * Extract audio entries from a pad zip into <downloadFolder>/SoundPads/<padName>/,
 * returning one descriptor per written sound. Non-audio entries and __MACOSX
 * cruft are skipped.
 */
export async function extractPadZip(
  zipBytes: Uint8Array,
  downloadFolder: string,
  padName: string
): Promise<ExtractedSound[]> {
  const entries = unzipSync(zipBytes, {
    filter: (f) => AUDIO_EXT.test(f.name) && !f.name.includes('__MACOSX/')
  })

  // Pad/file names may contain characters illegal in paths (e.g. "Combat: Siege").
  const safePad = sanitizeFsName(padName)
  const relDir = `SoundPads/${safePad}`
  const absDir = join(downloadFolder, 'SoundPads', safePad)
  await fs.mkdir(absDir, { recursive: true })

  const out: ExtractedSound[] = []
  for (const [entryName, data] of Object.entries(entries)) {
    if (!data || data.length === 0) continue
    const rawBase = entryName.split('/').pop()
    if (!rawBase) continue
    const base = sanitizeFsName(rawBase)
    await fs.writeFile(join(absDir, base), data)
    const { padType, looping } = classifyPadSound(base)
    out.push({
      fileName: base,
      relativePath: `${relDir}/${base}`,
      name: cleanSoundName(base),
      padType,
      looping,
      sizeBytes: data.length
    })
  }
  // Stable order by file name for deterministic shortcut-page layout.
  out.sort((a, b) => a.fileName.localeCompare(b.fileName))
  return out
}
