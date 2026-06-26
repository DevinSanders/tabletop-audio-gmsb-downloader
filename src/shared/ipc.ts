import type { Catalog } from './catalog'

/** Main -> renderer authentication / access state. */
export interface AuthStatus {
  loggedIn: boolean
  user?: { name?: string; imageUrl?: string }
  /** True when the signed-in account can access Tabletop Audio's paid alternates. */
  hasPaidAccess: boolean
  tier?: { id: string; title: string } | null
}

export interface DownloadRequest {
  downloadFolder: string
  /** CatalogFile.fileId values the user selected. */
  fileIds: string[]
}

export interface ProgressEvent {
  fileId: string
  fileName: string
  phase: 'start' | 'progress' | 'complete' | 'skip' | 'error'
  receivedBytes?: number
  totalBytes?: number
  percent?: number
  error?: string
}

export interface DebugExportResult {
  summaryPath: string
  rawPath: string
  campaignId: string | null
  postCount: number
  fileCount: number
}

export interface DownloadResult {
  downloaded: number
  skipped: number
  failed: number
  /** Absolute path to the written/updated GMSB import library. */
  libraryPath: string
  errors: { fileId: string; error: string }[]
}

/** Surface exposed on window.api by the preload bridge. */
export interface RendererApi {
  getAuthStatus(): Promise<AuthStatus>
  login(): Promise<AuthStatus>
  logout(): Promise<void>
  chooseFolder(): Promise<string | null>
  getSavedFolder(): Promise<string | null>
  /** Build the joined catalog (manifest + public links + Patreon enumeration). */
  loadCatalog(downloadFolder: string | null): Promise<Catalog>
  /** Dump raw Patreon metadata for debugging; writes files to downloadFolder (or userData). */
  exportPatreonDebug(downloadFolder: string | null): Promise<DebugExportResult>
  startDownload(req: DownloadRequest): Promise<DownloadResult>
  /** Subscribe to per-file progress. Returns an unsubscribe function. */
  onProgress(cb: (e: ProgressEvent) => void): () => void
}

/** IPC channel names. invoke/handle for request-response; `progress` is main->renderer. */
export const IPC = {
  getAuthStatus: 'auth:getStatus',
  login: 'auth:login',
  logout: 'auth:logout',
  chooseFolder: 'folder:choose',
  getSavedFolder: 'folder:getSaved',
  loadCatalog: 'catalog:load',
  exportPatreonDebug: 'patreon:exportDebug',
  startDownload: 'download:start',
  progress: 'download:progress'
} as const
