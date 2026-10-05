import { createWriteStream, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { apiGetJson, patreonSession } from './auth'
import {
  AUDIO_EXT,
  flattenPage,
  indexIncluded,
  mediaNameAndUrl,
  relationshipRefs,
  type PatreonContent,
  type RawPack,
  type RawPatreonFile,
  type RawSoundpad
} from './patreon-parse'

export type { PatreonContent, RawPack, RawPatreonFile, RawSoundpad }
export { flattenPage }

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


/** Enumerate all tracks, soundpads, and audio packs across every post. */
export async function fetchPatreonContent(campaignId: string): Promise<PatreonContent> {
  const pages = await fetchAllPages(campaignId)
  const files: RawPatreonFile[] = []
  const padBySlug = new Map<string, RawSoundpad>()
  const packByArchive = new Map<string, RawPack>()
  for (const page of pages) {
    const { files: f, pads, packs } = flattenPage(page)
    files.push(...f)
    // Pages are newest-first; keep the first (latest, e.g. remastered) of each.
    for (const p of pads) if (!padBySlug.has(p.slug)) padBySlug.set(p.slug, p)
    for (const p of packs) if (!packByArchive.has(p.archiveFileName)) packByArchive.set(p.archiveFileName, p)
  }
  return { files, pads: [...padBySlug.values()], packs: [...packByArchive.values()] }
}

/** Convenience: resolve campaign then enumerate; returns empty on any failure. */
export async function loadPatreonContent(): Promise<PatreonContent> {
  const campaignId = await resolveCampaignId()
  if (!campaignId) return { files: [], pads: [], packs: [] }
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
