import { padNameFromTitle, slugify } from './soundpad'

/**
 * Pure (Electron-free) parsing of Patreon's JSON:API post pages into loose track
 * files, soundpads, and audio packs. Kept separate from patreon.ts so it can be
 * unit-tested without the Electron session.
 *
 * Extraction is relationship-agnostic: every `included` object is indexed by id
 * and every relationship on each post is scanned, so it doesn't depend on one
 * exact (undocumented) relationship name.
 */

export const AUDIO_EXT = /\.(mp3|ogg|wav|flac|m4a|opus|aac)$/i
const ARCHIVE_EXT = /\.(zip|rar)$/i
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i
// "SoundPad: X", "New SoundPad: X", "SoundPad Remaster: X", "New SoundPad Preview: X"
const SOUNDPAD_TITLE_RE = /^\s*(?:new\s+)?soundpad(?:\s+(?:remaster(?:ed)?|preview))?\s*:/i
// Preview posts that don't lead with it, e.g. "Film Noir SoundPad Preview".
const SOUNDPAD_PREVIEW_RE = /\bsoundpad\s+preview\b/i
// The board archive itself, e.g. "Combat Future SoundPad.zip" — the most reliable signal.
const SOUNDPAD_ARCHIVE_RE = /soundpad\.(zip|rar)$/i
// Track bundles in regular posts (Distilled-Audio1.zip, "... Apothecaria OST 1.zip"),
// excluding the maps/minis/docs that sometimes ship alongside the music.
const AUDIO_PACK_RE = /audio|music|\bost\b|soundtrack|ambien|\bsounds?\b|\bogg\b|\bmp3\b|\bpack\b/i
const NON_AUDIO_PACK_RE = /map|mini|pdf|stat|item|companion|token|\bart\b|handout/i

export interface RawPatreonFile {
  fileName: string
  url: string
  postId: string
  postTitle?: string
  /** Whether the signed-in account can download this attachment (tier access). */
  canView: boolean
}

export interface RawSoundpad {
  postId: string
  title: string
  name: string
  slug: string
  archiveFileName: string
  archiveUrl: string
  isZip: boolean
  imageUrl?: string
  canView: boolean
}

/** A zip of ordinary tracks attached to a regular (non-SoundPad) post. */
export interface RawPack {
  postId: string
  title: string
  name: string
  archiveFileName: string
  archiveUrl: string
  isZip: boolean
  canView: boolean
}

export interface PatreonContent {
  files: RawPatreonFile[]
  pads: RawSoundpad[]
  packs: RawPack[]
}

/** Index every included object by `${type}:${id}` and by bare id (fallback). */
export function indexIncluded(doc: any): Map<string, any> {
  const map = new Map<string, any>()
  for (const inc of doc?.included ?? []) {
    map.set(`${inc.type}:${inc.id}`, inc)
    if (!map.has(inc.id)) map.set(inc.id, inc)
  }
  return map
}

/** All referenced {type,id} across every relationship of a post. */
export function relationshipRefs(post: any): Array<{ type?: string; id: string }> {
  const refs: Array<{ type?: string; id: string }> = []
  for (const rel of Object.values(post?.relationships ?? {})) {
    const data = (rel as any)?.data
    if (Array.isArray(data)) refs.push(...data)
    else if (data?.id) refs.push(data)
  }
  return refs
}

export function mediaNameAndUrl(inc: any): { name?: string; url?: string } {
  const a = inc?.attributes ?? {}
  return {
    name: a.file_name ?? a.name ?? undefined,
    url: a.download_url ?? a.url ?? undefined
  }
}

interface MediaItem {
  name: string
  url: string
}

/** All distinct media (name+url) attached to a post, by relationship scan. */
function postMedia(doc: any, post: any): MediaItem[] {
  const includedById = indexIncluded(doc)
  const seen = new Set<string>()
  const items: MediaItem[] = []
  for (const ref of relationshipRefs(post)) {
    const inc = includedById.get(`${ref.type}:${ref.id}`) ?? includedById.get(ref.id)
    if (!inc) continue
    const { name, url } = mediaNameAndUrl(inc)
    if (name && url && !seen.has(name)) {
      seen.add(name)
      items.push({ name, url })
    }
  }
  return items
}

const isAudioPack = (name: string): boolean =>
  AUDIO_PACK_RE.test(name) && !NON_AUDIO_PACK_RE.test(name)

/** Split one API page into loose track files, soundpads, and audio packs. */
export function flattenPage(doc: any): PatreonContent {
  const files: RawPatreonFile[] = []
  const pads: RawSoundpad[] = []
  const packs: RawPack[] = []

  for (const post of doc?.data ?? []) {
    const canView = Boolean(post.attributes?.current_user_can_view)
    const title: string = post.attributes?.title ?? ''
    const postId = String(post.id)
    const media = postMedia(doc, post)
    const archives = media.filter((m) => ARCHIVE_EXT.test(m.name))
    const padArchive = archives.find((m) => SOUNDPAD_ARCHIVE_RE.test(m.name))
    const titleIsPad = SOUNDPAD_TITLE_RE.test(title) || SOUNDPAD_PREVIEW_RE.test(title)

    if (titleIsPad || padArchive) {
      // A board ships as one archive; its loose preview MP3s are excluded from
      // the track list (the archive holds the full set).
      const archive = padArchive ?? archives[0]
      if (archive) {
        const image = media.find((m) => IMAGE_EXT.test(m.name))
        const name = titleIsPad
          ? padNameFromTitle(title)
          : archive.name.replace(SOUNDPAD_ARCHIVE_RE, '').trim()
        pads.push({
          postId,
          title,
          name,
          slug: slugify(name),
          archiveFileName: archive.name,
          archiveUrl: archive.url,
          isZip: /\.zip$/i.test(archive.name),
          imageUrl: image?.url,
          canView
        })
      }
      continue
    }

    for (const m of media) {
      if (AUDIO_EXT.test(m.name)) {
        files.push({ fileName: m.name, url: m.url, postId, postTitle: title, canView })
      }
    }

    const packArchives = archives.filter((a) => isAudioPack(a.name))
    const cleanTitle = title
      .replace(/^\s*new\s+(?:ambiences?|musical\s+tracks?|tracks?)\s*:\s*/i, '')
      .trim()
    for (const a of packArchives) {
      packs.push({
        postId,
        title,
        name: packArchives.length > 1 ? `${cleanTitle} — ${a.name.replace(ARCHIVE_EXT, '')}` : cleanTitle,
        archiveFileName: a.name,
        archiveUrl: a.url,
        isZip: /\.zip$/i.test(a.name),
        canView
      })
    }
  }
  return { files, pads, packs }
}
