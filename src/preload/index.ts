import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DownloadRequest, type ProgressEvent, type RendererApi } from '@shared/ipc'

const api: RendererApi = {
  getAuthStatus: () => ipcRenderer.invoke(IPC.getAuthStatus),
  login: () => ipcRenderer.invoke(IPC.login),
  logout: () => ipcRenderer.invoke(IPC.logout),
  chooseFolder: () => ipcRenderer.invoke(IPC.chooseFolder),
  getSavedFolder: () => ipcRenderer.invoke(IPC.getSavedFolder),
  loadCatalog: (downloadFolder) => ipcRenderer.invoke(IPC.loadCatalog, downloadFolder),
  exportPatreonDebug: (downloadFolder) => ipcRenderer.invoke(IPC.exportPatreonDebug, downloadFolder),
  rebuildLibrary: (downloadFolder) => ipcRenderer.invoke(IPC.rebuildLibrary, downloadFolder),
  startDownload: (req: DownloadRequest) => ipcRenderer.invoke(IPC.startDownload, req),
  onProgress: (cb: (e: ProgressEvent) => void) => {
    const listener = (_e: unknown, payload: ProgressEvent): void => cb(payload)
    ipcRenderer.on(IPC.progress, listener)
    return () => ipcRenderer.removeListener(IPC.progress, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
