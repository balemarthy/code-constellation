import { contextBridge, ipcRenderer } from 'electron'

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
})

contextBridge.exposeInMainWorld('api', {
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  scanDirectory: (path: string) => ipcRenderer.invoke('scan-directory', path),
  rescanDirectory: (path: string) => ipcRenderer.invoke('rescan-directory', path),
  getCallers: (funcName: string) => ipcRenderer.invoke('get-callers', funcName),
  getCallees: (funcName: string) => ipcRenderer.invoke('get-callees', funcName),
  getInactiveRanges: (filePath: string) => ipcRenderer.invoke('get-inactive-ranges', filePath),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),

  saveNotes: (rootDir: string, notes: Record<string, string>) => ipcRenderer.invoke('save-notes', rootDir, notes),
  getNotes: (rootDir: string) => ipcRenderer.invoke('get-notes', rootDir),
  saveSession: (rootDir: string, session: object) => ipcRenderer.invoke('save-session', rootDir, session),
  getSession: (rootDir: string) => ipcRenderer.invoke('get-session', rootDir),
  findSymbolByName: (name: string) => ipcRenderer.invoke('find-symbol-by-name', name),
  findCallPath: (from: string, to: string) => ipcRenderer.invoke('find-call-path', from, to),

  // Settings
  saveSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('save-settings', settings),
  getSettings: () => ipcRenderer.invoke('get-settings'),

  // AI — settings (including API key) are read from disk in main process
  aiExplain: (code: string, context: string) => ipcRenderer.invoke('ai-explain', code, context),

  // Menu event subscriptions — each returns an unsubscribe function
  onMenuOpenFolder: (cb: (dir: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, dir: string) => cb(dir)
    ipcRenderer.on('menu-open-folder', handler)
    return () => ipcRenderer.off('menu-open-folder', handler)
  },
  onMenuCloseProject: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu-close-project', handler)
    return () => ipcRenderer.off('menu-close-project', handler)
  },
  onMenuRescan: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu-rescan', handler)
    return () => ipcRenderer.off('menu-rescan', handler)
  },
})
