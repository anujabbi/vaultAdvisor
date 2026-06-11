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
  ProfileFact
} from '../shared/types'

const api = {
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:status'),
    signIn: (): Promise<void> => ipcRenderer.invoke('auth:signIn')
  },
  sample: {
    scenarios: (): Promise<HeroScenario[]> => ipcRenderer.invoke('sample:scenarios')
  },
  docs: {
    pick: (kind: DocKind): Promise<ExtractionDraft | null> => ipcRenderer.invoke('docs:pick', kind),
    uploadPath: (path: string, kind: DocKind): Promise<ExtractionDraft> =>
      ipcRenderer.invoke('docs:uploadPath', path, kind),
    confirm: (docId: number, kind: DocKind, edited: unknown): Promise<ChatMessage[]> =>
      ipcRenderer.invoke('docs:confirm', docId, kind, edited),
    list: (): Promise<DocumentMeta[]> => ipcRenderer.invoke('docs:list')
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
