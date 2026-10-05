import React from 'react'
import type { SoundpadEntry } from '@shared/catalog'
import type { ProgressEvent } from '@shared/ipc'

/** An archive is selectable if it's unlocked, not yet downloaded, and a .zip. */
export function isSelectableArchive(a: SoundpadEntry): boolean {
  return !a.locked && !a.alreadyDownloaded && a.isZip
}

interface Props {
  pads: SoundpadEntry[]
  /** Section heading, e.g. "Sound Boards". */
  title: string
  /** Short explanation shown after the count. */
  subtitle: string
  selectAllLabel: string
  selected: Set<string>
  progress: Map<string, ProgressEvent>
  onToggle: (padId: string) => void
  onSelectAll: () => void
  selectableCount: number
}

/** A grid of downloadable archives — used for Sound Boards and Audio Packs. */
export function Soundpads({
  pads,
  title,
  subtitle,
  selectAllLabel,
  selected,
  progress,
  onToggle,
  onSelectAll,
  selectableCount
}: Props): React.JSX.Element | null {
  if (pads.length === 0) return null
  return (
    <div className="soundpads">
      <div className="soundpads-head">
        <span>
          {title} <span className="muted">({pads.length})</span> — {subtitle}
        </span>
        <button onClick={onSelectAll} disabled={selectableCount === 0}>
          {selectAllLabel}
        </button>
      </div>
      <div className="pad-grid">
        {pads.map((pad) => {
          const disabled = !isSelectableArchive(pad)
          const prog = progress.get(pad.padId)
          return (
            <label
              key={pad.padId}
              className={`pad ${disabled ? 'disabled' : ''}`}
              title={pad.isZip ? pad.archiveFileName : `${pad.archiveFileName} — RAR archives aren't supported yet`}
            >
              <input
                type="checkbox"
                checked={selected.has(pad.padId)}
                disabled={disabled}
                onChange={() => onToggle(pad.padId)}
              />
              <span className="pad-name">{pad.name}</span>
              {!pad.isZip && <span className="muted">RAR</span>}
              {pad.locked && <span className="lock">🔒</span>}
              {pad.alreadyDownloaded && <span className="done">✓</span>}
              {prog?.phase === 'progress' && (
                <span className="bar">
                  <span className="bar-fill" style={{ width: `${prog.percent ?? 0}%` }} />
                </span>
              )}
              {prog?.phase === 'complete' && <span className="done">✓ {prog.fileName}</span>}
              {prog?.phase === 'error' && <span className="err">{prog.error}</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}
