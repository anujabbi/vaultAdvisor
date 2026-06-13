import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readSettings, writeSettings, type VaultName } from './settings'
import type { VaultManager } from './vaultManager'
import type { Db } from './store/db'
import {
  deleteAccount,
  deleteCash,
  deleteHolding,
  listAccountsWithItems,
  listCards,
  listDocuments,
  listProfileFacts,
  renameAccount,
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
  vm: VaultManager
  provider: LlmProvider
  ingest: IngestService
  engine: AdvisorEngine
  chat: ChatService
}): void {
  const { vm, provider, ingest, engine, chat } = deps

  // ---- vault switching (live swap + window reload; no relaunch) ----
  ipcMain.handle('vault:current', () => vm.vault)
  ipcMain.handle('vault:switch', (_e, name: VaultName) => {
    vm.switch(name)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.reload()
    return vm.vault
  })

  // ---- auth ----
  ipcMain.handle('auth:status', () => provider.status())
  ipcMain.handle('auth:signIn', () => provider.signIn())

  // ---- sample / hero ----
  ipcMain.handle('sample:scenarios', () => HERO_SCENARIOS)

  // ---- documents (Phase 1 — offline) ----
  ipcMain.handle('docs:pick', async (e, kind: DocKind) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a document',
      filters: [{ name: 'Statements', extensions: ['pdf', 'csv', 'xlsx', 'xls'] }],
      properties: ['openFile']
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return ingest.upload(r.filePaths[0], kind)
  })
  ipcMain.handle('docs:uploadPath', (_e, path: string, kind: DocKind) => ingest.upload(path, kind))
  ipcMain.handle('docs:cloudParse', (_e, docId: number, kind: DocKind) =>
    ingest.cloudParse(docId, kind)
  )
  ipcMain.handle('docs:manualDraft', (_e, kind: DocKind) => ingest.manualDraft(kind))
  ipcMain.handle('docs:confirm', (_e, docId: number, kind: DocKind, edited: unknown) => {
    ingest.confirm(docId, kind, edited)
    engine.refreshAvailability()
  })
  ipcMain.handle('docs:list', () => listDocuments(vm.db))

  // ---- accounts (grouped asset view; CRUD) ----
  ipcMain.handle('accounts:list', () => listAccountsWithItems(vm.db))
  ipcMain.handle('accounts:rename', (_e, id: number, friendlyName: string) => {
    renameAccount(vm.db, id, friendlyName)
    return listAccountsWithItems(vm.db)
  })
  ipcMain.handle('accounts:delete', (_e, id: number) => {
    deleteAccount(vm.db, id)
    engine.refreshAvailability()
    return listAccountsWithItems(vm.db)
  })
  ipcMain.handle(
    'accounts:deleteItem',
    (_e, item: { itemType: 'holding' | 'cash'; id: number }) => {
      if (item.itemType === 'holding') deleteHolding(vm.db, item.id)
      else deleteCash(vm.db, item.id)
      engine.refreshAvailability()
      return listAccountsWithItems(vm.db)
    }
  )

  // ---- advice consent (Phase 2 gate; remembered) ----
  ipcMain.handle('advice:consent:get', () => readSettings(app.getPath('userData')).adviceConsent)
  ipcMain.handle('advice:consent:set', (_e, v: boolean) => {
    const userData = app.getPath('userData')
    writeSettings(userData, { ...readSettings(userData), adviceConsent: v })
    return v
  })
  ipcMain.handle('advice:startProfiling', () => chat.openProfilingFromData())

  // ---- portfolio / profile ----
  ipcMain.handle('portfolio:summary', () => engine.summary())
  ipcMain.handle('profile:list', () => listProfileFacts(vm.db))
  ipcMain.handle('profile:set', (_e, key: string, value: string) => {
    setProfileFact(vm.db, { key, value, source: 'manual' })
    return listProfileFacts(vm.db)
  })

  // ---- advice cards ----
  ipcMain.handle('cards:list', () => engine.refreshAvailability())
  ipcMain.handle('cards:generate', (_e, domain: AdviceDomain) => engine.generateCard(domain))
  ipcMain.handle('cards:dismiss', (_e, domain: AdviceDomain) => {
    setCardStatus(vm.db, domain, 'dismissed')
    return listCards(vm.db)
  })
  ipcMain.handle('checklist:toggle', (_e, itemId: number, done: boolean) => {
    toggleChecklistItem(vm.db, itemId, done)
    return listCards(vm.db)
  })

  // ---- chat ----
  ipcMain.handle('chat:history', (_e, thread: string) => chat.history(thread))
  ipcMain.handle('chat:send', (e, thread: string, text: string) =>
    chat.send(thread, text, (delta) => {
      e.sender.send('chat:delta', { thread, delta })
    })
  )
}
