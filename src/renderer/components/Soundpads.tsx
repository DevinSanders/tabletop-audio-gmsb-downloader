import React from 'react'
import type { SoundpadEntry } from '@shared/catalog'
import type { ProgressEvent } from '@shared/ipc'

interface Props {
  pads: SoundpadEntry[]
  selected: Set<string>
  progress: Map<string, ProgressEvent>
  onToggle: (padId: string) => void
  onSelectAll: () => void
  selectableCount: number
}

export function Soundpads({
  pads,
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
          Sound Boards <span className="muted">({pads.length})</span> — each adds a shortcut page
        </span>
        <button onClick={onSelectAll} disabled={selectableCount === 0}>
          Select all sound boards
        </button>
      </div>
      <div className="pad-grid">
        {pads.map((pad) => {
          const disabled = pad.locked || pad.alreadyDownloaded
          const prog = progress.get(pad.padId)
          return (
            <label key={pad.padId} className={`pad ${disabled ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(pad.padId)}
                disabled={disabled}
                onChange={() => onToggle(pad.padId)}
              />
              <span className="pad-name">{pad.name}</span>
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
