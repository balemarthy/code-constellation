import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'

import path from 'node:path'
import * as fs from 'node:fs'
import { Analyzer } from './analyzer'
import type { SessionState } from '../src/types'


const __dirname = path.dirname(fileURLToPath(import.meta.url))


process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let analyzer: Analyzer | null = null
let rootDir: string | null = null  // track current project root for path sandboxing

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.maximize();

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  // Initialize Analyzer
  analyzer = new Analyzer(process.env.VITE_PUBLIC || '');

  // IPC Handlers
  ipcMain.handle('open-directory-dialog', async () => {
    if (!win) return undefined;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    return result.filePaths[0];
  });

  ipcMain.handle('scan-directory', async (_, dirPath: string) => {
    if (!analyzer) return null;
    rootDir = dirPath;
    return await analyzer.scanDirectory(dirPath);
  });

  ipcMain.handle('rescan-directory', async (_, dirPath: string) => {
    if (!analyzer) return null;
    rootDir = dirPath;
    analyzer.clearCache(dirPath);
    return await analyzer.scanDirectory(dirPath);
  });

  ipcMain.handle('get-callers', (_, funcName: string) => {
    if (!analyzer) return [];
    return analyzer.getCallers(funcName);
  });

  ipcMain.handle('get-callees', (_, funcName: string) => {
    if (!analyzer) return [];
    return analyzer.getCallees(funcName);
  });

  ipcMain.handle('find-symbol-by-name', (_, name: string) => {
    if (!analyzer) return null;
    return analyzer.findSymbolByName(name);
  });

  ipcMain.handle('read-file', (_, filePath: string) => {
    // Only allow reading files within the opened project directory
    if (rootDir && !filePath.startsWith(rootDir)) {
      throw new Error('Access denied: file is outside the opened project directory.');
    }
    return fs.promises.readFile(filePath, 'utf-8');
  });

  ipcMain.handle('get-inactive-ranges', async (_, filePath) => {
    return analyzer ? analyzer.getInactiveRanges(filePath) : [];
  });

  // Notes & Session IPC
  ipcMain.handle('save-notes', async (_, dir: string, notes: Record<string, string>) => {
    const notesPath = path.join(dir, '.code-constellation', 'notes.json');
    await fs.promises.mkdir(path.dirname(notesPath), { recursive: true });
    await fs.promises.writeFile(notesPath, JSON.stringify(notes, null, 2));
  });

  ipcMain.handle('get-notes', async (_, dir: string) => {
    const notesPath = path.join(dir, '.code-constellation', 'notes.json');
    try {
      return JSON.parse(await fs.promises.readFile(notesPath, 'utf8'));
    } catch {
      return {};
    }
  });

  ipcMain.handle('save-session', async (_, dir: string, session: SessionState) => {
    const sessionPath = path.join(dir, '.code-constellation', 'session.json');
    await fs.promises.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.promises.writeFile(sessionPath, JSON.stringify(session, null, 2));
  });

  ipcMain.handle('find-call-path', (_, from: string, to: string) => {
    if (!analyzer) return null;
    return analyzer.findCallPath(from, to);
  });

  ipcMain.handle('get-session', async (_, dir: string) => {
    const sessionPath = path.join(dir, '.code-constellation', 'session.json');
    try {
      return JSON.parse(await fs.promises.readFile(sessionPath, 'utf8')) as SessionState;
    } catch {
      return null;
    }
  });


  createWindow();
})
