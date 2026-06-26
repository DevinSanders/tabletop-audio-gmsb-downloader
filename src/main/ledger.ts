import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { LEDGER_FILENAME, emptyLedger, type Ledger, type LedgerEntry } from '@shared/ledger'

export async function readLedger(downloadFolder: string): Promise<Ledger> {
  const path = join(downloadFolder, LEDGER_FILENAME)
  try {
    const led = JSON.parse(await fs.readFile(path, 'utf8')) as Ledger
    if (!Array.isArray(led.entries)) return emptyLedger(downloadFolder)
    led.downloadRoot = downloadFolder
    if (typeof led.nextGmsbTrackId !== 'number') {
      led.nextGmsbTrackId = led.entries.reduce((m, e) => Math.max(m, e.gmsbTrackId), 0) + 1
    }
    return led
  } catch {
    return emptyLedger(downloadFolder)
  }
}

export async function writeLedger(downloadFolder: string, ledger: Ledger): Promise<void> {
  ledger.downloadRoot = downloadFolder
  await fs.writeFile(join(downloadFolder, LEDGER_FILENAME), JSON.stringify(ledger, null, 2), 'utf8')
}

export function hasFile(ledger: Ledger, fileId: string): boolean {
  return ledger.entries.some((e) => e.fileId === fileId)
}

/** Returns the fileIds in `selection` that are not yet recorded (need download). */
export function newFileIds(ledger: Ledger, selection: string[]): string[] {
  const have = new Set(ledger.entries.map((e) => e.fileId))
  return selection.filter((id) => !have.has(id))
}

export function allocateTrackId(ledger: Ledger): number {
  return ledger.nextGmsbTrackId++
}

export function upsertEntry(ledger: Ledger, entry: LedgerEntry): void {
  const i = ledger.entries.findIndex((e) => e.fileId === entry.fileId)
  if (i >= 0) ledger.entries[i] = entry
  else ledger.entries.push(entry)
}
