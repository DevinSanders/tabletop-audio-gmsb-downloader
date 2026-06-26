import { app } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

async function readAll(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const all = await readAll()
  return (all[key] as T) ?? null
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const all = await readAll()
  all[key] = value
  await fs.writeFile(settingsPath(), JSON.stringify(all, null, 2), 'utf8')
}
