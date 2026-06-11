import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { VaultManager } from './vaultManager'
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
    // VA_SWITCH_TEST=demo|personal first performs a live vault switch via
    // the real renderer IPC path (same code the topbar chip runs).
    // VA_SHOTS=<json path> runs a scripted capture session:
    //   [{ "js": "<run in page>", "wait": ms, "file": "<png path>" }, ...]
    const shotPath = process.env.VA_SCREENSHOT
    const shotsPlan = process.env.VA_SHOTS
    if (shotPath || shotsPlan) {
      setTimeout(async () => {
        const { writeFileSync, readFileSync } = await import('fs')
        const target = process.env.VA_SWITCH_TEST
        if (target === 'demo' || target === 'personal') {
          await win.webContents.executeJavaScript(`window.vault.vaults.switch('${target}')`)
          await new Promise((r) => setTimeout(r, 3500)) // let reload + re-render finish
        }
        if (shotsPlan) {
          const steps: { js?: string; wait?: number; file?: string }[] = JSON.parse(
            readFileSync(shotsPlan, 'utf8')
          )
          for (const step of steps) {
            if (step.js) await win.webContents.executeJavaScript(step.js)
            await new Promise((r) => setTimeout(r, step.wait ?? 600))
            if (step.file) writeFileSync(step.file, (await win.webContents.capturePage()).toPNG())
          }
        }
        if (shotPath) {
          writeFileSync(shotPath, (await win.webContents.capturePage()).toPNG())
        }
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
  // VaultManager owns the active vault (VA_VAULT env override > saved
  // setting) and self-seeds the demo vault with John Doe on first open.
  const vm = new VaultManager(userData)
  const provider = new ClaudeProvider()
  const ingest = new IngestService(vm, provider)
  const engine = new AdvisorEngine(vm, provider)
  const chat = new ChatService(vm, provider, engine)
  registerIpc({ vm, provider, ingest, engine, chat })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
