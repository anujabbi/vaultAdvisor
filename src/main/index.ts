import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { openDb } from './store/db'
import { listDocuments } from './store/repos'
import { dbPathFor, readSettings } from './settings'
import { seedJohnDoe } from './sample/johnDoe'
import { registerIpc } from './ipc'
import { ClaudeProvider } from './llm/claudeProvider'
import { IngestService } from './ingest/ingest'
import { AdvisorEngine } from './advisor/engine'
import { ChatService } from './chat/chat'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#101312',
    title: 'VaultAdvisor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    // Dev utility: VA_SCREENSHOT=<path> captures the window and exits.
    const shotPath = process.env.VA_SCREENSHOT
    if (shotPath) {
      setTimeout(async () => {
        const img = await win.webContents.capturePage()
        const { writeFileSync } = await import('fs')
        writeFileSync(shotPath, img.toPNG())
        app.quit()
      }, 3500)
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    // citations and external links open in the system browser
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  // Active vault: VA_VAULT env override > saved setting. The demo vault
  // self-seeds with the John Doe dataset on first open.
  const vault =
    process.env.VA_VAULT === 'demo' || process.env.VA_VAULT === 'personal'
      ? process.env.VA_VAULT
      : readSettings(userData).vault
  const db = openDb(dbPathFor(userData, vault))
  if (vault === 'demo' && listDocuments(db).length === 0) {
    seedJohnDoe(db)
  }
  const provider = new ClaudeProvider()
  const ingest = new IngestService(db, provider, join(userData, 'vault'))
  const engine = new AdvisorEngine(db, provider)
  const chat = new ChatService(db, provider, engine)
  registerIpc({ db, provider, ingest, engine, chat, vault })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
