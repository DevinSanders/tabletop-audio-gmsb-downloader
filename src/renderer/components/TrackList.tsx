import React, { useRef, useState } from 'react'
import type { CatalogFile, CatalogTrack } from '@shared/catalog'
import type { ProgressEvent } from '@shared/ipc'
import { VARIANT_LABELS } from '@shared/variants'

type ShownTrack = CatalogTrack & { visibleFiles: CatalogFile[] }

interface Props {
  tracks: ShownTrack[]
  selected: Set<string>
  progress: Map<string, ProgressEvent>
  onToggleFile: (fileId: string) => void
  onToggleMany: (ids: string[], on: boolean) => void
}

function TriStateCheckbox({
  checked,
  indeterminate,
  onChange
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />
}

function FileRow({
  file,
  selected,
  progress,
  onToggle
}: {
  file: CatalogFile
  selected: boolean
  progress?: ProgressEvent
  onToggle: () => void
}): React.JSX.Element {
  const disabled = file.locked || file.alreadyDownloaded
  const pct = progress?.percent
  return (
    <div className={`file-row ${disabled ? 'disabled' : ''}`}>
      <label className="file-main">
        <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggle} />
        <span className="file-name">{file.displayName}</span>
        <span className={`vbadge v-${file.variant}`}>{VARIANT_LABELS[file.variant]}</span>
        <span className={`src src-${file.source}`}>{file.source}</span>
      </label>
      <div className="file-status">
        {file.locked && <span className="lock">🔒 locked</span>}
        {file.alreadyDownloaded && <span className="done">✓ downloaded</span>}
        {progress && progress.phase === 'error' && <span className="err">{progress.error}</span>}
        {progress && progress.phase === 'complete' && <span className="done">✓ done</span>}
        {progress && progress.phase === 'progress' && (
          <span className="bar">
            <span className="bar-fill" style={{ width: `${pct ?? 0}%` }} />
            <span className="bar-label">{pct != null ? `${pct}%` : '…'}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function TrackRow({
  track,
  selected,
  progress,
  onToggleFile,
  onToggleMany
}: {
  track: ShownTrack
  selected: Set<string>
  progress: Map<string, ProgressEvent>
  onToggleFile: (id: string) => void
  onToggleMany: (ids: string[], on: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selectable = track.visibleFiles.filter((f) => !f.locked && !f.alreadyDownloaded)
  const selectableIds = selectable.map((f) => f.fileId)
  const selectedCount = selectableIds.filter((id) => selected.has(id)).length
  const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length
  const someSelected = selectedCount > 0

  return (
    <div className="track-row">
      <div className="track-head">
        <TriStateCheckbox
          checked={allSelected}
          indeterminate={someSelected}
          onChange={() => onToggleMany(selectableIds, !allSelected)}
        />
        <button className="disclose" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'}
        </button>
        {track.number != null && <span className="num">#{track.number}</span>}
        <span className="track-title" onClick={() => setOpen((o) => !o)}>
          {track.title}
        </span>
        {track.key == null && <span className="badge muted" title="Not yet in public manifest">new</span>}
        <span className="file-count">
          {track.visibleFiles.length} file{track.visibleFiles.length === 1 ? '' : 's'}
        </span>
      </div>
      {open && (
        <div className="files">
          {track.visibleFiles.map((file) => (
            <FileRow
              key={file.fileId}
              file={file}
              selected={selected.has(file.fileId)}
              progress={progress.get(file.fileId)}
              onToggle={() => onToggleFile(file.fileId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TrackList({
  tracks,
  selected,
  progress,
  onToggleFile,
  onToggleMany
}: Props): React.JSX.Element {
  if (tracks.length === 0) {
    return <p className="status">No tracks match the current filters.</p>
  }
  return (
    <div className="track-list">
      {tracks.map((track) => (
        <TrackRow
          key={track.number != null ? `n${track.number}` : `t${track.title}`}
          track={track}
          selected={selected}
          progress={progress}
          onToggleFile={onToggleFile}
          onToggleMany={onToggleMany}
        />
      ))}
    </div>
  )
}
