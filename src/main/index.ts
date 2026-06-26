import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC, type DownloadRequest } from '@shared/ipc'
import { getAuthStatus, login, logout } from './auth'
import { buildCatalog, runDownload } from './service'
import { exportDebugMetadata } from './patreon'
import { getSetting, setSetting } from './settings'

const SAVED_FOLDER_KEY = 'downloadFolder'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Tabletop Audio → GMSB Downloader',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
  return win
}

function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.getAuthStatus, () => getAuthStatus())
  ipcMain.handle(IPC.login, () => login())
  ipcMain.handle(IPC.logout, () => logout())

  ipcMain.handle(IPC.getSavedFolder, () => getSetting<string>(SAVED_FOLDER_KEY))

  ipcMain.handle(IPC.chooseFolder, async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Choose download folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    await setSetting(SAVED_FOLDER_KEY, folder)
    return folder
  })

  ipcMain.handle(IPC.loadCatalog, (_e, downloadFolder: string | null) => buildCatalog(downloadFolder))

  ipcMain.handle(IPC.exportPatreonDebug, async (_e, downloadFolder: string | null) => {
    const dest = downloadFolder ?? app.getPath('userData')
    const result = await exportDebugMetadata(dest)
    shell.showItemInFolder(result.summaryPath)
    return result
  })

  ipcMain.handle(IPC.startDownload, (_e, req: DownloadRequest) => {
    const win = getWindow()
    return runDownload(req, (event) => {
      if (win && !win.isDestroyed()) win.webContents.send(IPC.progress, event)
    })
  })
}

app.whenReady().then(() => {
  let mainWindow: BrowserWindow | null = createWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  registerIpc(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      mainWindow.on('closed', () => {
        mainWindow = null
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
