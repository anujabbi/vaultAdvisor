import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdviceCard,
  AdviceDomain,
  AuthStatus,
  ChatMessage,
  DocKind,
  DocumentMeta,
  ExtractionDraft,
  HeroScenario,
  PortfolioSummary,
  ProfileFact,
  UploadResult
} from '../shared/types'

const api = {
  vaults: {
    current: (): Promise<'personal' | 'demo'> => ipcRenderer.invoke('vault:current'),
    switch: (name: 'personal' | 'demo'): Promise<void> => ipcRenderer.invoke('vault:switch', name)
  },
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:status'),
    signIn: (): Promise<void> => ipcRenderer.invoke('auth:signIn')
  },
  sample: {
    scenarios: (): Promise<HeroScenario[]> => ipcRenderer.invoke('sample:scenarios')
  },
  docs: {
    pick: (kind: DocKind): Promise<UploadResult | null> => ipcRenderer.invoke('docs:pick', kind),
    uploadPath: (path: string, kind: DocKind): Promise<UploadResult> =>
      ipcRenderer.invoke('docs:uploadPath', path, kind),
    cloudParse: (docId: number, kind: DocKind): Promise<ExtractionDraft> =>
      ipcRenderer.invoke('docs:cloudParse', docId, kind),
    manualDraft: (kind: DocKind): Promise<ExtractionDraft> =>
      ipcRenderer.invoke('docs:manualDraft', kind),
    confirm: (docId: number, kind: DocKind, edited: unknown): Promise<void> =>
      ipcRenderer.invoke('docs:confirm', docId, kind, edited),
    list: (): Promise<DocumentMeta[]> => ipcRenderer.invoke('docs:list')
  },
  advice: {
    consentGet: (): Promise<boolean> => ipcRenderer.invoke('advice:consent:get'),
    consentSet: (v: boolean): Promise<boolean> => ipcRenderer.invoke('advice:consent:set', v),
    startProfiling: (): Promise<ChatMessage[]> => ipcRenderer.invoke('advice:startProfiling')
  },
  portfolio: {
    summary: (): Promise<PortfolioSummary> => ipcRenderer.invoke('portfolio:summary')
  },
  profile: {
    list: (): Promise<ProfileFact[]> => ipcRenderer.invoke('profile:list'),
    set: (key: string, value: string): Promise<ProfileFact[]> =>
      ipcRenderer.invoke('profile:set', key, value)
  },
  cards: {
    list: (): Promise<AdviceCard[]> => ipcRenderer.invoke('cards:list'),
    generate: (domain: AdviceDomain): Promise<AdviceCard> =>
      ipcRenderer.invoke('cards:generate', domain),
    dismiss: (domain: AdviceDomain): Promise<AdviceCard[]> =>
      ipcRenderer.invoke('cards:dismiss', domain)
  },
  checklist: {
    toggle: (itemId: number, done: boolean): Promise<AdviceCard[]> =>
      ipcRenderer.invoke('checklist:toggle', itemId, done)
  },
  chat: {
    history: (thread: string): Promise<ChatMessage[]> => ipcRenderer.invoke('chat:history', thread),
    send: (thread: string, text: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke('chat:send', thread, text),
    onDelta: (cb: (p: { thread: string; delta: string }) => void): (() => void) => {
      const listener = (_e: unknown, p: { thread: string; delta: string }): void => cb(p)
      ipcRenderer.on('chat:delta', listener)
      return () => ipcRenderer.removeListener('chat:delta', listener)
    }
  }
}

export type VaultApi = typeof api

contextBridge.exposeInMainWorld('vault', api)
