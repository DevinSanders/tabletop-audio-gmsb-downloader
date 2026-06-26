import { createWriteStream, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { apiGetJson, patreonSession } from './auth'
import { padNameFromTitle, slugify } from './soundpad'

/**
 * Lightweight Tabletop Audio Patreon client built on the persistent Electron
 * session (see auth.ts). Resolves the campaign, paginates every post (cursor
 * based), and flattens audio attachments to downloadable files.
 *
 * Patreon's internal JSON:API is undocumented; rather than depend on one exact
 * relationship name, extraction is relationship-agnostic: it indexes every
 * `included` object by id and scans every relationship on each post. The
 * `exportDebugMetadata` dump exists to inspect the real shape when something is
 * missing. Everything degrades to "no Patreon files" rather than crashing.
 */

const CREATOR_VANITY = 'tabletopaudio'
const AUDIO_EXT = /\.(mp3|ogg|wav|flac|m4a|opus|aac)$/i
const ARCHIVE_EXT = /\.(zip|rar)$/i
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i
const SOUNDPAD_TITLE_RE = /^\s*(new\s+)?soundpad:/i

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

export interface PatreonContent {
  files: RawPatreonFile[]
  pads: RawSoundpad[]
}

/** Discover Tabletop Audio's numeric campaign id by scraping the creator page. */
export async function resolveCampaignId(): Promise<string | null> {
  try {
    const res = await patreonSession().fetch(`https://www.patreon.com/${CREATOR_VANITY}`)
    if (!res.ok) return null
    const html = await res.text()
    const patterns = [
      /"campaign"\s*:\s*\{\s*"data"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/,
      /"campaign_id"\s*:\s*"?(\d+)"?/,
      /\/api\/campaigns\/(\d+)/,
      /campaign\/(\d+)/
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m) return m[1]
    }
    return null
  } catch {
    return null
  }
}

function buildPostsUrl(campaignId: string, cursor: string | null): string {
  const params = [
    'include=attachments_media,media,images,audio,audio_preview',
    'fields[post]=title,current_user_can_view,post_type',
    'fields[media]=download_url,file_name,name,mimetype,size_bytes',
    `filter[campaign_id]=${campaignId}`,
    'filter[contains_exclusive_posts]=true',
    'sort=-published_at',
    'json-api-use-default-includes=true',
    'json-api-version=1.0',
    'page[count]=20'
  ]
  if (cursor) params.push(`page[cursor]=${encodeURIComponent(cursor)}`)
  return `/api/posts?${params.join('&')}`
}

/** Fetch every page of the creator's posts via cursor pagination. */
async function fetchAllPages(campaignId: string): Promise<any[]> {
  const pages: any[] = []
  let cursor: string | null = null
  let guard = 0
  do {
    const doc: any = await apiGetJson(buildPostsUrl(campaignId, cursor))
    if (!doc) break
    pages.push(doc)
    cursor = doc?.meta?.pagination?.cursors?.next ?? null
  } while (cursor && guard++ < 500)
  return pages
}

/** Index every included object by `${type}:${id}` and by bare id (fallback). */
function indexIncluded(doc: any): Map<string, any> {
  const map = new Map<string, any>()
  for (const inc of doc?.included ?? []) {
    map.set(`${inc.type}:${inc.id}`, inc)
    if (!map.has(inc.id)) map.set(inc.id, inc)
  }
  return map
}

/** All referenced {type,id} across every relationship of a post. */
function relationshipRefs(post: any): Array<{ type?: string; id: string }> {
  const refs: Array<{ type?: string; id: string }> = []
  for (const rel of Object.values(post?.relationships ?? {})) {
    const data = (rel as any)?.data
    if (Array.isArray(data)) refs.push(...data)
    else if (data?.id) refs.push(data)
  }
  return refs
}

function mediaNameAndUrl(inc: any): { name?: string; url?: string } {
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

function flattenPage(doc: any): PatreonContent {
  const files: RawPatreonFile[] = []
  const pads: RawSoundpad[] = []

  for (const post of doc?.data ?? []) {
    const canView = Boolean(post.attributes?.current_user_can_view)
    const title: string = post.attributes?.title ?? ''
    const media = postMedia(doc, post)
    const isPadPost = SOUNDPAD_TITLE_RE.test(title)

    if (isPadPost) {
      // Soundpads ship a single archive; their loose promo mp3s are excluded
      // from the regular track list to avoid clutter.
      const archive = media.find((m) => ARCHIVE_EXT.test(m.name))
      if (archive) {
        const image = media.find((m) => IMAGE_EXT.test(m.name))
        const name = padNameFromTitle(title)
        pads.push({
          postId: String(post.id),
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
        files.push({ fileName: m.name, url: m.url, postId: String(post.id), postTitle: title, canView })
      }
    }
  }
  return { files, pads }
}

/** Enumerate all tracks and soundpads across every post. */
export async function fetchPatreonContent(campaignId: string): Promise<PatreonContent> {
  const pages = await fetchAllPages(campaignId)
  const files: RawPatreonFile[] = []
  const padBySlug = new Map<string, RawSoundpad>()
  for (const page of pages) {
    const { files: f, pads } = flattenPage(page)
    files.push(...f)
    // Pages are newest-first; keep the first (latest, e.g. remastered) per slug.
    for (const p of pads) if (!padBySlug.has(p.slug)) padBySlug.set(p.slug, p)
  }
  return { files, pads: [...padBySlug.values()] }
}

/** Convenience: resolve campaign then enumerate; returns empty on any failure. */
export async function loadPatreonContent(): Promise<PatreonContent> {
  const campaignId = await resolveCampaignId()
  if (!campaignId) return { files: [], pads: [] }
  return fetchPatreonContent(campaignId)
}

/**
 * Diagnostic dump for debugging missing/misclassified files. Writes the raw API
 * pages and a per-post/per-attachment summary (relationship keys, included types,
 * attributes) to the given folder. Returns the summary file path.
 */
export async function exportDebugMetadata(destDir: string): Promise<{ rawPath: string; summaryPath: string; campaignId: string | null; postCount: number; fileCount: number }> {
  const campaignId = await resolveCampaignId()
  const pages = campaignId ? await fetchAllPages(campaignId) : []

  const includedTypeSamples: Record<string, any> = {}
  const relationshipKeyCounts: Record<string, number> = {}
  const posts: any[] = []
  let fileCount = 0

  for (const doc of pages) {
    for (const inc of doc?.included ?? []) {
      if (!includedTypeSamples[inc.type]) {
        includedTypeSamples[inc.type] = { id: inc.id, attributeKeys: Object.keys(inc.attributes ?? {}), attributes: inc.attributes }
      }
    }
    const includedById = indexIncluded(doc)
    for (const post of doc?.data ?? []) {
      for (const k of Object.keys(post.relationships ?? {})) {
        relationshipKeyCounts[k] = (relationshipKeyCounts[k] ?? 0) + 1
      }
      const attachments = relationshipRefs(post).map((ref) => {
        const inc = includedById.get(`${ref.type}:${ref.id}`) ?? includedById.get(ref.id)
        const { name, url } = inc ? mediaNameAndUrl(inc) : {}
        const isAudio = !!name && AUDIO_EXT.test(name)
        if (isAudio) fileCount++
        return {
          refType: ref.type,
          refId: ref.id,
          foundInIncluded: !!inc,
          includedType: inc?.type,
          fileName: name,
          hasUrl: !!url,
          isAudio,
          attributeKeys: inc ? Object.keys(inc.attributes ?? {}) : []
        }
      })
      posts.push({
        id: post.id,
        title: post.attributes?.title ?? '',
        postType: post.attributes?.post_type,
        currentUserCanView: post.attributes?.current_user_can_view,
        relationshipKeys: Object.keys(post.relationships ?? {}),
        attachments
      })
    }
  }

  const rawPath = join(destDir, 'patreon-debug-raw.json')
  const summaryPath = join(destDir, 'patreon-debug-summary.json')
  await fs.mkdir(destDir, { recursive: true })
  await fs.writeFile(rawPath, JSON.stringify(pages, null, 2), 'utf8')
  await fs.writeFile(
    summaryPath,
    JSON.stringify(
      { campaignId, pageCount: pages.length, postCount: posts.length, audioFileCount: fileCount, relationshipKeyCounts, includedTypeSamples, posts },
      null,
      2
    ),
    'utf8'
  )

  return { rawPath, summaryPath, campaignId, postCount: posts.length, fileCount }
}

/**
 * Stream a URL to disk. Public links use a plain fetch; Patreon attachments use
 * the authenticated session. Returns the number of bytes written.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  source: 'public' | 'patreon',
  onProgress?: (received: number, total?: number) => void
): Promise<number> {
  const res = source === 'patreon' ? await patreonSession().fetch(url) : await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)

  const total = Number(res.headers.get('content-length')) || undefined
  await fs.mkdir(dirname(destPath), { recursive: true })

  let received = 0
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress?.(received, total)
  })
  await pipeline(body, createWriteStream(destPath))
  return received
}
