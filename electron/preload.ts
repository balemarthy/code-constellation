import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...rest] = args
    return ipcRenderer.off(channel, ...rest)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...rest] = args
    return ipcRenderer.send(channel, ...rest)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...rest] = args
    return ipcRenderer.invoke(channel, ...rest)
  },

  // You can expose other apts here, if you want
})

contextBridge.exposeInMainWorld('api', {
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  scanDirectory: (path: string) => ipcRenderer.invoke('scan-directory', path),
  getCallers: (funcName: string) => ipcRenderer.invoke('get-callers', funcName),
  getCallees: (funcName: string) => ipcRenderer.invoke('get-callees', funcName),
  getInactiveRanges: (filePath: string) => ipcRenderer.invoke('get-inactive-ranges', filePath),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),

  saveNotes: (rootDir: string, notes: any) => ipcRenderer.invoke('save-notes', rootDir, notes),
  getNotes: (rootDir: string) => ipcRenderer.invoke('get-notes', rootDir),
  saveSession: (rootDir: string, session: any) => ipcRenderer.invoke('save-session', rootDir, session),
  getSession: (rootDir: string) => ipcRenderer.invoke('get-session', rootDir),

})
