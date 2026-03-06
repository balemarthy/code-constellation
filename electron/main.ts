import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as fs from 'node:fs'
import { Analyzer } from './analyzer'
import type { SessionState, AppSettings } from '../src/types'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let analyzer: Analyzer | null = null
let rootDir: string | null = null

// ── Default models per provider ──────────────────────────────────────────────
const DEFAULT_MODEL: Record<string, string> = {
  claude: 'claude-opus-4-6',
  'openai-compatible': 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  ollama: 'llama3.2',
}

// ── AI router ─────────────────────────────────────────────────────────────────
async function callAI(code: string, context: string, settings: AppSettings): Promise<string> {
  const provider = settings.provider ?? 'claude'
  const model = settings.model || DEFAULT_MODEL[provider]
  const prompt = `You are an expert code explainer for embedded systems developers. Explain the following code clearly and concisely.\n\nContext: ${context}\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nExplain: what this code does, the algorithm or pattern used, important behaviors, and any gotchas an embedded developer should know.`

  switch (provider) {
    case 'claude': {
      if (!settings.apiKey) throw new Error('Claude API key not configured. Open Settings to add it.')
      const client = new Anthropic({ apiKey: settings.apiKey })
      const msg = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = msg.content[0]
      return block.type === 'text' ? block.text : ''
    }
    case 'openai-compatible': {
      // API key is optional — LM Studio and some local servers don't require one
      const clientOptions: { apiKey: string; baseURL?: string } = { apiKey: settings.apiKey || 'none' }
      if (settings.apiBaseUrl) clientOptions.baseURL = settings.apiBaseUrl
      const client = new OpenAI(clientOptions)
      const completion = await client.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const content = completion.choices?.[0]?.message?.content
      if (!content) throw new Error(`No response from model. Check that the model name "${model}" is correct and the server is running at ${settings.apiBaseUrl || 'https://api.openai.com/v1'}.`)
      return content
    }
    case 'gemini': {
      if (!settings.apiKey) throw new Error('Gemini API key not configured. Open Settings to add it.')
      const genAI = new GoogleGenerativeAI(settings.apiKey)
      const geminiModel = genAI.getGenerativeModel({ model })
      const result = await geminiModel.generateContent(prompt)
      return result.response.text()
    }
    case 'ollama': {
      const baseUrl = settings.ollamaUrl?.replace(/\/$/, '') || 'http://localhost:11434'
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
      })
      if (!response.ok) throw new Error(`Ollama error: ${response.statusText}. Is Ollama running?`)
      const data = await response.json() as { message: { content: string } }
      return data.message.content
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.maximize()

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!win) return
            const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
            if (!result.canceled && result.filePaths[0]) {
              win.webContents.send('menu-open-folder', result.filePaths[0])
            }
          },
        },
        {
          label: 'Close Project',
          click: () => win?.webContents.send('menu-close-project'),
        },
        { type: 'separator' },
        {
          label: 'Rescan Project',
          accelerator: 'CmdOrCtrl+R',
          click: () => win?.webContents.send('menu-rescan'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function readSettings(): Promise<AppSettings> {
  const settingsPath = path.join(app.getPath('userData'), 'cc-settings.json')
  try {
    return JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')) as AppSettings
  } catch {
    return {}
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
  analyzer = new Analyzer(process.env.VITE_PUBLIC || '')

  // ── Settings IPC ───────────────────────────────────────────────────────────
  ipcMain.handle('save-settings', async (_, settings: AppSettings) => {
    const settingsPath = path.join(app.getPath('userData'), 'cc-settings.json')
    await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2))
  })

  ipcMain.handle('get-settings', async () => {
    return readSettings()
  })

  // ── AI Explain IPC — reads provider/key from disk, never from renderer ─────
  ipcMain.handle('ai-explain', async (_, code: string, context: string) => {
    const settings = await readSettings()
    return callAI(code, context, settings)
  })

  // ── Directory IPC ──────────────────────────────────────────────────────────
  ipcMain.handle('open-directory-dialog', async () => {
    if (!win) return undefined
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    return result.filePaths[0]
  })

  ipcMain.handle('scan-directory', async (_, dirPath: string) => {
    if (!analyzer) return null
    rootDir = dirPath
    return await analyzer.scanDirectory(dirPath)
  })

  ipcMain.handle('rescan-directory', async (_, dirPath: string) => {
    if (!analyzer) return null
    rootDir = dirPath
    analyzer.clearCache(dirPath)
    return await analyzer.scanDirectory(dirPath)
  })

  ipcMain.handle('get-callers', (_, funcName: string) => {
    if (!analyzer) return []
    return analyzer.getCallers(funcName)
  })

  ipcMain.handle('get-callees', (_, funcName: string) => {
    if (!analyzer) return []
    return analyzer.getCallees(funcName)
  })

  ipcMain.handle('find-symbol-by-name', (_, name: string) => {
    if (!analyzer) return null
    return analyzer.findSymbolByName(name)
  })

  ipcMain.handle('read-file', (_, filePath: string) => {
    if (rootDir && !filePath.startsWith(rootDir)) {
      throw new Error('Access denied: file is outside the opened project directory.')
    }
    return fs.promises.readFile(filePath, 'utf-8')
  })

  ipcMain.handle('get-inactive-ranges', async (_, filePath) => {
    return analyzer ? analyzer.getInactiveRanges(filePath) : []
  })

  // ── Notes & Session IPC ────────────────────────────────────────────────────
  ipcMain.handle('save-notes', async (_, dir: string, notes: Record<string, string>) => {
    const notesPath = path.join(dir, '.code-constellation', 'notes.json')
    await fs.promises.mkdir(path.dirname(notesPath), { recursive: true })
    await fs.promises.writeFile(notesPath, JSON.stringify(notes, null, 2))
  })

  ipcMain.handle('get-notes', async (_, dir: string) => {
    const notesPath = path.join(dir, '.code-constellation', 'notes.json')
    try {
      return JSON.parse(await fs.promises.readFile(notesPath, 'utf8'))
    } catch {
      return {}
    }
  })

  ipcMain.handle('save-session', async (_, dir: string, session: SessionState) => {
    const sessionPath = path.join(dir, '.code-constellation', 'session.json')
    await fs.promises.mkdir(path.dirname(sessionPath), { recursive: true })
    await fs.promises.writeFile(sessionPath, JSON.stringify(session, null, 2))
  })

  ipcMain.handle('get-session', async (_, dir: string) => {
    const sessionPath = path.join(dir, '.code-constellation', 'session.json')
    try {
      return JSON.parse(await fs.promises.readFile(sessionPath, 'utf8')) as SessionState
    } catch {
      return null
    }
  })

  ipcMain.handle('find-call-path', (_, from: string, to: string) => {
    if (!analyzer) return null
    return analyzer.findCallPath(from, to)
  })

  createWindow()
  buildMenu()
})
