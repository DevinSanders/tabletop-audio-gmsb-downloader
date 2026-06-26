import { BrowserWindow, session, type Session } from 'electron'
import type { AuthStatus } from '@shared/ipc'

/**
 * Authentication via Electron's own persistent session. Cookies set during the
 * embedded login live in this partition on disk, so the user logs in once and
 * stays logged in across launches — no manual cookie extraction or OS-keychain
 * storage required. All Patreon API calls and downloads reuse this session, so
 * they run inside Chromium's network stack (which clears Cloudflare challenges).
 */
export const PATREON_PARTITION = 'persist:patreon'

// A current desktop Chrome UA; Electron's default UA contains "Electron" and is
// more likely to be challenged.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

let configured = false
export function patreonSession(): Session {
  const ses = session.fromPartition(PATREON_PARTITION)
  if (!configured) {
    ses.setUserAgent(CHROME_UA)
    configured = true
  }
  return ses
}

/** GET a Patreon JSON:API path with the persistent session. Returns null on failure. */
export async function apiGetJson(path: string): Promise<any | null> {
  try {
    const res = await patreonSession().fetch(`https://www.patreon.com${path}`, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  // /api/current_user returns the signed-in identity (or 401 when logged out).
  const me = await apiGetJson('/api/current_user')
  if (!me?.data) return { loggedIn: false, hasPaidAccess: false }
  const a = me.data.attributes ?? {}
  return {
    loggedIn: true,
    user: { name: a.full_name ?? a.first_name ?? undefined, imageUrl: a.image_url ?? undefined },
    // Paid access is resolved authoritatively during catalog load (whether any
    // gated attachment is viewable); left false here as a conservative default.
    hasPaidAccess: false
  }
}

/**
 * Opens the Patreon login page in a window using the persistent partition and
 * resolves once the session is authenticated (or the user closes the window).
 */
export function login(): Promise<AuthStatus> {
  const win = new BrowserWindow({
    width: 520,
    height: 760,
    title: 'Sign in to Patreon',
    autoHideMenuBar: true,
    webPreferences: { partition: PATREON_PARTITION, contextIsolation: true, sandbox: true }
  })
  void win.loadURL('https://www.patreon.com/login')

  return new Promise<AuthStatus>((resolve) => {
    let settled = false
    const settle = (status: AuthStatus): void => {
      if (settled) return
      settled = true
      win.removeAllListeners('closed')
      if (!win.isDestroyed()) win.close()
      resolve(status)
    }

    const check = async (): Promise<void> => {
      const status = await getAuthStatus()
      if (status.loggedIn) settle(status)
    }

    // After any navigation that lands logged-in (e.g. redirect to /home), finish.
    win.webContents.on('did-navigate', () => void check())
    win.webContents.on('did-navigate-in-page', () => void check())
    win.on('closed', () => {
      if (!settled) {
        settled = true
        resolve({ loggedIn: false, hasPaidAccess: false })
      }
    })
  })
}

export async function logout(): Promise<void> {
  await patreonSession().clearStorageData()
}
