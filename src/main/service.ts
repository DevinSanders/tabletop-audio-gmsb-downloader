import { app } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { loadManifest } from './manifest'
import { classifyFile, indexManifest, type ManifestIndex } from './matcher'
import { loadPatreonContent, downloadToFile } from './patreon'
import { loadUseCaseTags } from './usecase'
import { extractPadZip, unzipAudio } from './soundpad'
import { assembleCatalog, relativePathFor } from './catalog'
import { readLedger, writeLedger, allocateTrackId, upsertEntry } from './ledger'
import { buildLibraryDocument, writeLibrary } from './gmsb'
import type { Catalog, CatalogFile, CatalogTrack, SoundpadEntry } from '@shared/catalog'
import type { DownloadRequest, DownloadResult, ProgressEvent } from '@shared/ipc'
import type { UseCaseTags } from '@shared/usecase'
import { emptyLedger, type Ledger } from '@shared/ledger'

interface CatalogContext {
  folder: string | null
  catalog: Catalog
  index: ManifestIndex
  useCaseByKey: Record<string, UseCaseTags>
  fileIndex: Map<string, { file: CatalogFile; track: CatalogTrack }>
  /** Soundpads and audio packs, keyed by their selection id (pad:… / pack:…). */
  archiveIndex: Map<string, SoundpadEntry>
}

// Cache the last assembled catalog so a download doesn't re-enumerate Patreon.
let cache: CatalogContext | null = null

export async function buildCatalog(downloadFolder: string | null): Promise<Catalog> {
  const userData = app.getPath('userData')
  const manifest = await loadManifest(userData)
  const index = indexManifest(manifest)
  const useCaseByKey = await loadUseCaseTags(userData)
  const { files, pads, packs } = await loadPatreonContent()
  const ledger = downloadFolder ? await readLedger(downloadFolder) : emptyLedger('')
  const catalog = assembleCatalog(manifest, index, files, pads, useCaseByKey, ledger, new Date(), packs)

  const fileIndex = new Map<string, { file: CatalogFile; track: CatalogTrack }>()
  for (const track of catalog.tracks) {
    for (const file of track.files) fileIndex.set(file.fileId, { file, track })
  }
  const archiveIndex = new Map<string, SoundpadEntry>()
  for (const a of [...catalog.soundpads, ...catalog.packs]) archiveIndex.set(a.padId, a)

  cache = { folder: downloadFolder, catalog, index, useCaseByKey, fileIndex, archiveIndex }
  return catalog
}

/**
 * Download an audio-pack zip and add each audio file as an ordinary track —
 * classified (stem/variant, manifest match) exactly like a loose Patreon file.
 */
async function downloadPack(
  pack: SoundpadEntry,
  folder: string,
  ledger: Ledger,
  index: ManifestIndex,
  emit: (e: ProgressEvent) => void
): Promise<number> {
  if (!pack.isZip) {
    emit({ fileId: pack.padId, fileName: pack.archiveFileName, phase: 'error', error: 'Unsupported archive (only .zip is supported).' })
    throw new Error('unsupported archive')
  }
  emit({ fileId: pack.padId, fileName: pack.archiveFileName, phase: 'start' })
  const tmpZip = join(tmpdir(), `tta-pack-${Date.now()}.zip`)
  try {
    await downloadToFile(pack.archiveUrl, tmpZip, 'patreon', (received, total) =>
      emit({
        fileId: pack.padId,
        fileName: pack.archiveFileName,
        phase: 'progress',
        receivedBytes: received,
        totalBytes: total,
        percent: total ? Math.round((received / total) * 100) : undefined
      })
    )
    const haveNames = new Set(ledger.entries.map((e) => e.fileName))
    let added = 0
    for (const { fileName, data } of unzipAudio(new Uint8Array(await fs.readFile(tmpZip)))) {
      // Skip anything already in the library under the same name (e.g. the
      // public copy of a full mix that's also bundled in the pack).
      if (haveNames.has(fileName)) continue
      const c = classifyFile(fileName, index)
      const relativePath = relativePathFor({ variant: c.variant, fileName })
      const dest = join(folder, ...relativePath.split('/'))
      await fs.mkdir(join(dest, '..'), { recursive: true })
      await fs.writeFile(dest, data)
      upsertEntry(ledger, {
        fileId: `${pack.padId}:${fileName}`,
        fileName,
        relativePath,
        variant: c.variant,
        baseType: c.baseType,
        altDescriptor: c.altDescriptor,
        source: 'patreon',
        manifestKey: c.matched?.key ?? null,
        trackNumber: c.trackNumber ?? c.matched?.key ?? null,
        title: c.title,
        sizeBytes: data.length,
        downloadedAt: new Date().toISOString(),
        gmsbTrackId: allocateTrackId(ledger)
      })
      haveNames.add(fileName)
      added++
    }
    ledger.packs ??= []
    if (!ledger.packs.some((p) => p.packId === pack.padId)) {
      ledger.packs.push({ packId: pack.padId, name: pack.name, postId: pack.postId, downloadedAt: new Date().toISOString() })
    }
    emit({ fileId: pack.padId, fileName: `${pack.name} (${added} tracks)`, phase: 'complete', percent: 100 })
    return added
  } finally {
    await fs.rm(tmpZip, { force: true }).catch(() => {})
  }
}

async function downloadFile(
  id: string,
  file: CatalogFile,
  track: CatalogTrack,
  folder: string,
  ledger: Ledger,
  emit: (e: ProgressEvent) => void
): Promise<void> {
  const relativePath = relativePathFor(file)
  const dest = join(folder, ...relativePath.split('/'))
  emit({ fileId: id, fileName: file.fileName, phase: 'start' })
  const size = await downloadToFile(file.url, dest, file.source, (received, total) =>
    emit({
      fileId: id,
      fileName: file.fileName,
      phase: 'progress',
      receivedBytes: received,
      totalBytes: total,
      percent: total ? Math.round((received / total) * 100) : undefined
    })
  )
  upsertEntry(ledger, {
    fileId: id,
    fileName: file.fileName,
    relativePath,
    variant: file.variant,
    baseType: file.baseType,
    altDescriptor: file.altDescriptor,
    source: file.source,
    manifestKey: track.key,
    trackNumber: track.number,
    title: track.title,
    sizeBytes: size,
    downloadedAt: new Date().toISOString(),
    gmsbTrackId: allocateTrackId(ledger)
  })
  emit({ fileId: id, fileName: file.fileName, phase: 'complete', receivedBytes: size, totalBytes: size, percent: 100 })
}

/** Download a soundpad zip, extract its sounds, and record them + the pad. */
async function downloadPad(
  pad: SoundpadEntry,
  folder: string,
  ledger: Ledger,
  emit: (e: ProgressEvent) => void
): Promise<number> {
  if (!pad.isZip) {
    emit({ fileId: pad.padId, fileName: pad.archiveFileName, phase: 'error', error: 'Unsupported archive (only .zip is supported).' })
    throw new Error('unsupported archive')
  }
  emit({ fileId: pad.padId, fileName: pad.archiveFileName, phase: 'start' })
  const tmpZip = join(tmpdir(), `tta-pad-${pad.slug}-${Date.now()}.zip`)
  try {
    await downloadToFile(pad.archiveUrl, tmpZip, 'patreon', (received, total) =>
      emit({
        fileId: pad.padId,
        fileName: pad.archiveFileName,
        phase: 'progress',
        receivedBytes: received,
        totalBytes: total,
        percent: total ? Math.round((received / total) * 100) : undefined
      })
    )
    const buf = await fs.readFile(tmpZip)
    const sounds = await extractPadZip(new Uint8Array(buf), folder, pad.name)

    let added = 0
    for (const s of sounds) {
      const fileId = `pad:${pad.slug}:${s.fileName}`
      if (ledger.entries.some((e) => e.fileId === fileId)) continue
      upsertEntry(ledger, {
        fileId,
        fileName: s.fileName,
        relativePath: s.relativePath,
        variant: 'other',
        baseType: 'full',
        source: 'patreon',
        manifestKey: null,
        trackNumber: null,
        title: s.name,
        sizeBytes: s.sizeBytes,
        downloadedAt: new Date().toISOString(),
        gmsbTrackId: allocateTrackId(ledger),
        soundpad: pad.slug,
        padType: s.padType
      })
      added++
    }
    if (!ledger.pads.some((p) => p.slug === pad.slug)) {
      ledger.pads.push({ slug: pad.slug, name: pad.name, postId: pad.postId, downloadedAt: new Date().toISOString() })
    }
    emit({ fileId: pad.padId, fileName: `${pad.name} (${added} sounds)`, phase: 'complete', percent: 100 })
    return added
  } finally {
    await fs.rm(tmpZip, { force: true }).catch(() => {})
  }
}

/** Rewrite gmsb-library.json from the current ledger — no downloading. */
export async function rebuildLibrary(
  downloadFolder: string
): Promise<{ libraryPath: string; trackCount: number }> {
  const userData = app.getPath('userData')
  const index = indexManifest(await loadManifest(userData))
  const useCaseByKey = await loadUseCaseTags(userData)
  const ledger = await readLedger(downloadFolder)
  const doc = buildLibraryDocument(ledger, index, useCaseByKey, downloadFolder, new Date())
  const libraryPath = await writeLibrary(downloadFolder, doc)
  return { libraryPath, trackCount: doc.Tracks.length }
}

export async function runDownload(
  req: DownloadRequest,
  emit: (e: ProgressEvent) => void
): Promise<DownloadResult> {
  if (!cache || cache.folder !== req.downloadFolder) {
    await buildCatalog(req.downloadFolder)
  }
  const ctx = cache!
  const ledger = await readLedger(req.downloadFolder)
  const have = new Set(ledger.entries.map((e) => e.fileId))
  const havePads = new Set(ledger.pads.map((p) => p.slug))
  const havePacks = new Set((ledger.packs ?? []).map((p) => p.packId))

  let downloaded = 0
  let skipped = 0
  let failed = 0
  const errors: { fileId: string; error: string }[] = []

  for (const id of req.fileIds) {
    // Soundpad or audio-pack selection (both are archives).
    const isPad = id.startsWith('pad:')
    if (isPad || id.startsWith('pack:')) {
      const archive = ctx.archiveIndex.get(id)
      if (!archive) {
        skipped++
        continue
      }
      if (isPad ? havePads.has(archive.slug) : havePacks.has(archive.padId)) {
        emit({ fileId: id, fileName: archive.name, phase: 'skip' })
        skipped++
        continue
      }
      if (archive.locked) {
        emit({ fileId: id, fileName: archive.name, phase: 'error', error: 'Locked: your tier does not include this download.' })
        errors.push({ fileId: id, error: 'locked' })
        failed++
        continue
      }
      try {
        downloaded += isPad
          ? await downloadPad(archive, req.downloadFolder, ledger, emit)
          : await downloadPack(archive, req.downloadFolder, ledger, ctx.index, emit)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        emit({ fileId: id, fileName: archive.name, phase: 'error', error: message })
        errors.push({ fileId: id, error: message })
        failed++
      }
      continue
    }

    // Regular file selection.
    const hit = ctx.fileIndex.get(id)
    if (!hit) {
      skipped++
      continue
    }
    if (have.has(id)) {
      emit({ fileId: id, fileName: hit.file.fileName, phase: 'skip' })
      skipped++
      continue
    }
    if (hit.file.locked) {
      emit({ fileId: id, fileName: hit.file.fileName, phase: 'error', error: 'Locked: your tier does not include this file.' })
      errors.push({ fileId: id, error: 'locked' })
      failed++
      continue
    }
    try {
      await downloadFile(id, hit.file, hit.track, req.downloadFolder, ledger, emit)
      downloaded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emit({ fileId: id, fileName: hit.file.fileName, phase: 'error', error: message })
      errors.push({ fileId: id, error: message })
      failed++
    }
  }

  await writeLedger(req.downloadFolder, ledger)
  const doc = buildLibraryDocument(ledger, ctx.index, ctx.useCaseByKey, req.downloadFolder, new Date())
  const libraryPath = await writeLibrary(req.downloadFolder, doc)

  cache = null
  return { downloaded, skipped, failed, libraryPath, errors }
}
