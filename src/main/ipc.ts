import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readSettings, writeSettings, type VaultName } from './settings'
import type { Db } from './store/db'
import {
  listCards,
  listDocuments,
  listProfileFacts,
  setCardStatus,
  setProfileFact,
  toggleChecklistItem
} from './store/repos'
import type { AdviceDomain, DocKind } from '../shared/types'
import type { LlmProvider } from './llm/provider'
import { IngestService } from './ingest/ingest'
import { AdvisorEngine } from './advisor/engine'
import { ChatService } from './chat/chat'
import { HERO_SCENARIOS } from './sample/persona'

export function registerIpc(deps: {
  db: Db
  provider: LlmProvider
  ingest: IngestService
  engine: AdvisorEngine
  chat: ChatService
  vault: VaultName
}): void {
  const { db, provider, ingest, engine, chat, vault } = deps

  // ---- vault switching (relaunches the app on the other vault) ----
  ipcMain.handle('vault:current', () => vault)
  ipcMain.handle('vault:switch', (_e, name: VaultName) => {
    const userData = app.getPath('userData')
    writeSettings(userData, { ...readSettings(userData), vault: name })
    app.relaunch()
    app.exit(0)
  })

  // ---- auth ----
  ipcMain.handle('auth:status', () => provider.status())
  ipcMain.handle('auth:signIn', () => provider.signIn())

  // ---- sample / hero ----
  ipcMain.handle('sample:scenarios', () => HERO_SCENARIOS)

  // ---- documents ----
  ipcMain.handle('docs:pick', async (e, kind: DocKind) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a document',
      filters: [{ name: 'Statements', extensions: ['pdf', 'csv'] }],
      properties: ['openFile']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return ingest.upload(r.filePaths[0], kind)
  })
  ipcMain.handle('docs:uploadPath', (_e, path: string, kind: DocKind) => ingest.upload(path, kind))
  ipcMain.handle('docs:confirm', async (_e, docId: number, kind: DocKind, edited: unknown) => {
    ingest.confirm(docId, kind, edited)
    engine.refreshAvailability()
    const summary = JSON.stringify(edited).slice(0, 1500)
    return chat.openProfiling(docId, kind, summary)
  })
  ipcMain.handle('docs:list', () => listDocuments(db))

  // ---- portfolio / profile ----
  ipcMain.handle('portfolio:summary', () => engine.summary())
  ipcMain.handle('profile:list', () => listProfileFacts(db))
  ipcMain.handle('profile:set', (_e, key: string, value: string) => {
    setProfileFact(db, { key, value, source: 'manual' })
    return listProfileFacts(db)
  })

  // ---- advice cards ----
  ipcMain.handle('cards:list', () => engine.refreshAvailability())
  ipcMain.handle('cards:generate', (_e, domain: AdviceDomain) => engine.generateCard(domain))
  ipcMain.handle('cards:dismiss', (_e, domain: AdviceDomain) => {
    setCardStatus(db, domain, 'dismissed')
    return listCards(db)
  })
  ipcMain.handle('checklist:toggle', (_e, itemId: number, done: boolean) => {
    toggleChecklistItem(db, itemId, done)
    return listCards(db)
  })

  // ---- chat ----
  ipcMain.handle('chat:history', (_e, thread: string) => chat.history(thread))
  ipcMain.handle('chat:send', (e, thread: string, text: string) =>
    chat.send(thread, text, (delta) => {
      e.sender.send('chat:delta', { thread, delta })
    })
  )
}
