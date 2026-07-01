import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthStatus, DownloadResult, ProgressEvent } from '@shared/ipc'
import type { Catalog } from '@shared/catalog'
import { VARIANT_LABELS, VARIANT_ORDER, type VariantType } from '@shared/variants'
import {
  USECASE_CATEGORIES,
  USECASE_CATEGORY_LABELS,
  USECASE_OPTIONS,
  useCaseId
} from '@shared/usecase'
import {
  availableGenres,
  availableUseCase,
  defaultFilters,
  selectableFileIds,
  visibleTracks,
  type FilterState
} from './lib/filter'
import { TrackList } from './components/TrackList'
import { Soundpads } from './components/Soundpads'

function formatCount(n: number): string {
  return n.toLocaleString()
}

export function App(): React.JSX.Element {
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(defaultFilters())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<Map<string, ProgressEvent>>(new Map())
  const [result, setResult] = useState<DownloadResult | null>(null)
  const [debugMsg, setDebugMsg] = useState<string | null>(null)
  const [showMoreFilters, setShowMoreFilters] = useState(false)

  // Subscribe to download progress once.
  useEffect(() => {
    return window.api.onProgress((e) => {
      setProgress((prev) => {
        const next = new Map(prev)
        next.set(e.fileId, e)
        return next
      })
    })
  }, [])

  const refreshCatalog = useCallback(async (f: string | null) => {
    setLoadingCatalog(true)
    try {
      const cat = await window.api.loadCatalog(f)
      setCatalog(cat)
    } finally {
      setLoadingCatalog(false)
    }
  }, [])

  // Initial load: auth + saved folder + catalog.
  useEffect(() => {
    void (async () => {
      const [status, savedFolder] = await Promise.all([
        window.api.getAuthStatus(),
        window.api.getSavedFolder()
      ])
      setAuth(status)
      setFolder(savedFolder)
      await refreshCatalog(savedFolder)
    })()
  }, [refreshCatalog])

  const onLogin = async (): Promise<void> => {
    setBusy('Signing in…')
    try {
      const status = await window.api.login()
      setAuth(status)
      await refreshCatalog(folder)
    } finally {
      setBusy(null)
    }
  }

  const onLogout = async (): Promise<void> => {
    await window.api.logout()
    setAuth({ loggedIn: false, hasPaidAccess: false })
    await refreshCatalog(folder)
  }

  const onChooseFolder = async (): Promise<void> => {
    const chosen = await window.api.chooseFolder()
    if (chosen) {
      setFolder(chosen)
      setSelected(new Set())
      setResult(null)
      await refreshCatalog(chosen)
    }
  }

  const hasPatreonAccess = catalog?.hasPatreonAccess ?? false
  // Access is only "known" once a catalog has loaded; until then we must not
  // claim the user lacks paid access (avoids a false "no access" flash on launch).
  const accessKnown = catalog != null && !loadingCatalog

  const shownTracks = useMemo(
    () => (catalog ? visibleTracks(catalog, filters) : []),
    [catalog, filters]
  )
  const selectableIds = useMemo(() => selectableFileIds(shownTracks), [shownTracks])
  const genres = useMemo(() => (catalog ? availableGenres(catalog) : []), [catalog])
  const useCaseOpts = useMemo(
    () => (catalog ? availableUseCase(catalog) : { civ: [], biome: [], mood: [], action: [] }),
    [catalog]
  )

  const visiblePads = useMemo(() => {
    const pads = catalog?.soundpads ?? []
    const q = filters.search.toLowerCase()
    return pads.filter((p) => {
      if (filters.newOnly && p.alreadyDownloaded) return false
      if (filters.hideLocked && p.locked) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalog, filters])
  const padSelectableIds = useMemo(
    () => visiblePads.filter((p) => !p.locked && !p.alreadyDownloaded).map((p) => p.padId),
    [visiblePads]
  )

  const toggleVariant = (v: VariantType): void => {
    setFilters((f) => {
      const variants = new Set(f.variants)
      if (variants.has(v)) variants.delete(v)
      else variants.add(v)
      return { ...f, variants }
    })
  }

  const toggleGenre = (g: string): void => {
    setFilters((f) => {
      const next = new Set(f.genres)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return { ...f, genres: next }
    })
  }

  const toggleUseCase = (id: string): void => {
    setFilters((f) => {
      const next = new Set(f.useCase)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...f, useCase: next }
    })
  }

  const toggleFile = useCallback((fileId: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }, [])

  const setMany = useCallback((ids: string[], on: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])

  const selectAllTracks = (): void => setMany(selectableIds, true)
  const selectAllPads = (): void => setMany(padSelectableIds, true)
  const clearSelection = (): void => setSelected(new Set())

  const onRebuildLibrary = async (): Promise<void> => {
    if (!folder) return
    setBusy('Rebuilding library…')
    setDebugMsg(null)
    try {
      const res = await window.api.rebuildLibrary(folder)
      setDebugMsg(`Rebuilt library with ${res.trackCount} tracks: ${res.libraryPath}`)
    } finally {
      setBusy(null)
    }
  }

  const onExportDebug = async (): Promise<void> => {
    setBusy('Exporting Patreon metadata…')
    setDebugMsg(null)
    try {
      const res = await window.api.exportPatreonDebug(folder)
      setDebugMsg(
        `Wrote ${res.fileCount} audio files across ${res.postCount} posts (campaign ${res.campaignId ?? 'unresolved'}). Summary: ${res.summaryPath}`
      )
    } finally {
      setBusy(null)
    }
  }

  const canDownload = folder != null && selected.size > 0 && busy == null

  const onDownload = async (): Promise<void> => {
    if (!folder) return
    setBusy('Downloading…')
    setResult(null)
    setProgress(new Map())
    try {
      const res = await window.api.startDownload({ downloadFolder: folder, fileIds: [...selected] })
      setResult(res)
      setSelected(new Set())
      await refreshCatalog(folder)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Tabletop Audio → GMSB Downloader</h1>
        <div className="auth">
          {auth?.loggedIn ? (
            <>
              <span className="who">{auth.user?.name ?? 'Signed in'}</span>
              <span className={`badge ${!accessKnown ? 'muted' : hasPatreonAccess ? 'ok' : 'muted'}`}>
                {!accessKnown
                  ? 'Checking access…'
                  : hasPatreonAccess
                    ? 'Patreon alternates: enabled'
                    : 'Alternates: no paid access'}
              </span>
              <button onClick={onLogout}>Sign out</button>
            </>
          ) : (
            <>
              <span className="badge muted">Not signed in — full versions only</span>
              <button className="primary" onClick={onLogin}>
                Sign in to Patreon
              </button>
            </>
          )}
        </div>
      </header>

      <div className="toolbar">
        <div className="folder">
          <span className="label">Download folder:</span>
          <code className={folder ? '' : 'empty'}>{folder ?? 'none selected'}</code>
          <button onClick={onChooseFolder}>{folder ? 'Change…' : 'Choose…'}</button>
        </div>
        <button onClick={() => refreshCatalog(folder)} disabled={loadingCatalog}>
          {loadingCatalog ? 'Loading…' : 'Refresh'}
        </button>
        <button
          onClick={onRebuildLibrary}
          disabled={busy != null || !folder}
          title="Rewrite gmsb-library.json from already-downloaded files (no downloading)"
        >
          Rebuild library
        </button>
        <button onClick={onExportDebug} disabled={busy != null || !auth?.loggedIn} title="Dump raw Patreon metadata for debugging">
          Export Patreon metadata (debug)
        </button>
      </div>

      {debugMsg && <div className="result">{debugMsg}</div>}

      <div className="filters">
        <input
          className="search"
          placeholder="Search title or tag…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <div className="variant-toggles">
          {VARIANT_ORDER.map((v) => {
            const disabled = v !== 'full' && !hasPatreonAccess
            const active = filters.variants.has(v) && !disabled
            return (
              <button
                key={v}
                className={`toggle ${active ? 'active' : ''}`}
                disabled={disabled}
                title={disabled ? 'Requires Patreon paid access' : ''}
                onClick={() => toggleVariant(v)}
              >
                {VARIANT_LABELS[v]}
              </button>
            )
          })}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.newOnly}
            onChange={(e) => setFilters((f) => ({ ...f, newOnly: e.target.checked }))}
          />
          New only
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.hideLocked}
            onChange={(e) => setFilters((f) => ({ ...f, hideLocked: e.target.checked }))}
          />
          Hide locked
        </label>
      </div>

      {genres.length > 0 && (
        <div className="genre-chips">
          {genres.map((g) => (
            <button
              key={g}
              className={`chip ${filters.genres.has(g) ? 'active' : ''}`}
              onClick={() => toggleGenre(g)}
            >
              {g}
            </button>
          ))}
          <button className="more-filters" onClick={() => setShowMoreFilters((v) => !v)}>
            More filters {showMoreFilters ? '▾' : '▸'}
          </button>
        </div>
      )}

      {showMoreFilters && (
        <div className="usecase-filters">
          {USECASE_CATEGORIES.map((cat) => {
            const present = useCaseOpts[cat]
            if (present.length === 0) return null
            return (
              <div className="usecase-group" key={cat}>
                <span className="usecase-label">{USECASE_CATEGORY_LABELS[cat]}</span>
                <div className="usecase-chips">
                  {present.map((key) => {
                    const id = useCaseId(cat, key)
                    return (
                      <button
                        key={id}
                        className={`chip ${filters.useCase.has(id) ? 'active' : ''}`}
                        onClick={() => toggleUseCase(id)}
                      >
                        {USECASE_OPTIONS[cat][key] ?? key}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="selection-bar">
        <span>
          {formatCount(shownTracks.length)} tracks · {formatCount(visiblePads.length)} boards ·{' '}
          {formatCount(selectableIds.length + padSelectableIds.length)} selectable ·{' '}
          <strong>{formatCount(selected.size)}</strong> selected
        </span>
        <div className="spacer" />
        <button onClick={selectAllTracks} disabled={selectableIds.length === 0}>
          Select all tracks
        </button>
        <button onClick={clearSelection} disabled={selected.size === 0}>
          Clear
        </button>
        <button className="primary" onClick={onDownload} disabled={!canDownload}>
          {busy ?? `Download ${formatCount(selected.size)}`}
        </button>
      </div>

      {accessKnown && !hasPatreonAccess && auth?.loggedIn && (
        <div className="notice">
          Your account does not have paid access to Tabletop Audio's alternate versions. Only the free
          full versions are available to download.
        </div>
      )}

      {result && (
        <div className="result">
          Downloaded {result.downloaded}, skipped {result.skipped}, failed {result.failed}. Library
          updated at <code>{result.libraryPath}</code>.
        </div>
      )}

      <main className="app-main">
        {loadingCatalog && !catalog ? (
          <p className="status">Loading catalog…</p>
        ) : (
          <>
            <Soundpads
              pads={visiblePads}
              selected={selected}
              progress={progress}
              onToggle={toggleFile}
              onSelectAll={selectAllPads}
              selectableCount={padSelectableIds.length}
            />
            <TrackList
              tracks={shownTracks}
              selected={selected}
              progress={progress}
              onToggleFile={toggleFile}
              onToggleMany={setMany}
            />
          </>
        )}
      </main>
    </div>
  )
}
