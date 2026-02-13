import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'

import path from 'node:path'
import * as fs from 'node:fs'
import { Analyzer } from './analyzer'


const __dirname = path.dirname(fileURLToPath(import.meta.url))


process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let analyzer: Analyzer | null = null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

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
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    });
    return result.filePaths[0];
  });

  ipcMain.handle('scan-directory', async (_, dirPath: string) => {
    if (!analyzer) return null;
    return await analyzer.scanDirectory(dirPath);
  });

  ipcMain.handle('get-callers', (_, funcName: string) => {
    if (!analyzer) return [];
    return analyzer.getCallers(funcName);
  });

  ipcMain.handle('read-file', (_, filePath: string) => {
    return fs.promises.readFile(filePath, 'utf-8');
  });

  ipcMain.handle('get-inactive-ranges', async (_, filePath) => {
    return analyzer ? analyzer.getInactiveRanges(filePath) : [];
  });

  // Notes & Session IPC
  ipcMain.handle('save-notes', async (_, rootDir, notes) => {
    const notesPath = path.join(rootDir, '.code-constellation', 'notes.json');
    const dir = path.dirname(notesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
  });

  ipcMain.handle('get-notes', async (_, rootDir) => {
    const notesPath = path.join(rootDir, '.code-constellation', 'notes.json');
    if (fs.existsSync(notesPath)) {
      return JSON.parse(fs.readFileSync(notesPath, 'utf8'));
    }
    return {};
  });

  ipcMain.handle('save-session', async (_, rootDir, session) => {
    const sessionPath = path.join(rootDir, '.code-constellation', 'session.json');
    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  });

  ipcMain.handle('get-session', async (_, rootDir) => {
    const sessionPath = path.join(rootDir, '.code-constellation', 'session.json');
    if (fs.existsSync(sessionPath)) {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    }
    return null;
  });


  createWindow();
})
