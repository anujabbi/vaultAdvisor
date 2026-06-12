import React, { useCallback, useEffect, useState } from 'react'
import type {
  AdviceCard,
  AdviceDomain,
  AuthStatus,
  ChatMessage,
  DocKind,
  HeroScenario,
  PortfolioSummary
} from '../../shared/types'
import { HeroScenarios } from './components/HeroScenarios'
import { UploadFlow } from './components/UploadFlow'
import { Dashboard } from './components/Dashboard'
import { CardDetail } from './components/CardDetail'
import { ChatPanel } from './components/ChatPanel'
import { ProfilePage } from './components/ProfilePage'

type View = 'home' | 'profile'

export default function App(): React.JSX.Element {
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(false)
  const [scenarios, setScenarios] = useState<HeroScenario[]>([])
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [cards, setCards] = useState<AdviceCard[]>([])
  const [generating, setGenerating] = useState<Set<AdviceDomain>>(new Set())
  const [view, setView] = useState<View>('home')
  const [uploadKind, setUploadKind] = useState<DocKind | null>(null)
  const [openCard, setOpenCard] = useState<AdviceCard | null>(null)
  const [chat, setChat] = useState<{ thread: string; title: string; initial?: ChatMessage[] } | null>(null)
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [vault, setVault] = useState<'personal' | 'demo'>('personal')

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([window.vault.portfolio.summary(), window.vault.cards.list()])
    setSummary(s)
    setCards(c)
  }, [])

  useEffect(() => {
    window.vault.sample.scenarios().then(setScenarios)
    window.vault.auth.status().then(setAuth)
    window.vault.vaults.current().then(setVault)
    refresh()
  }, [refresh])

  function showToast(msg: string, error = false): void {
    setToast({ msg, error })
    setTimeout(() => setToast(null), 5000)
  }

  async function recheckAuth(): Promise<void> {
    setCheckingAuth(true)
    try {
      setAuth(await window.vault.auth.status())
    } finally {
      setCheckingAuth(false)
    }
  }

  async function startUpload(kind: DocKind): Promise<void> {
    const a = auth ?? (await window.vault.auth.status())
    setAuth(a)
    if (!a.authenticated) {
      showToast('Sign in with Claude first — your AI does the reading.', true)
      return
    }
    setUploadKind(kind)
  }

  async function generate(domain: AdviceDomain): Promise<void> {
    setGenerating((g) => new Set(g).add(domain))
    try {
      await window.vault.cards.generate(domain)
      await refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true)
    } finally {
      setGenerating((g) => {
        const next = new Set(g)
        next.delete(domain)
        return next
      })
    }
  }

  const hasData = summary?.hasHoldings || summary?.hasIncome || summary?.hasCash || summary?.hasTaxFacts

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">
          Vault<em>Advisor</em>
        </span>
        <span className="lock-pip">
          <span className="dot" /> NO ACCOUNT LINKING · STORED ON THIS MACHINE
        </span>
        <button
          className={`vault-chip ${vault}`}
          title={
            vault === 'demo'
              ? 'You are in the John Doe demo vault. Click to switch back to your own vault (app restarts).'
              : 'Switch to the John Doe demo vault — sample data for demos (app restarts).'
          }
          onClick={() => window.vault.vaults.switch(vault === 'demo' ? 'personal' : 'demo')}
        >
          {vault === 'demo' ? '◉ DEMO — John Doe' : 'Demo mode'}
        </button>
        <span className="spacer" />
        <button className={`navbtn ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
          {hasData ? 'Ledger' : 'Start'}
        </button>
        <button className={`navbtn ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}>
          Profile
        </button>
        {hasData && (
          <button className="navbtn" onClick={() => setChat({ thread: 'advisor', title: 'Your advisor' })}>
            Chat
          </button>
        )}
        <AuthChip auth={auth} checking={checkingAuth} onSignIn={async () => {
          try {
            await window.vault.auth.signIn()
            showToast('Complete the sign-in in the window that opened, then click “re-check”.')
          } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), true)
          }
        }} onRecheck={recheckAuth} />
      </header>

      <main className="main">
        {view === 'profile' ? (
          <ProfilePage />
        ) : hasData && summary ? (
          <Dashboard
            summary={summary}
            cards={cards}
            generating={generating}
            onOpenCard={setOpenCard}
            onGenerate={generate}
            onUnlockUpload={startUpload}
          />
        ) : (
          <HeroScenarios scenarios={scenarios} onStartUpload={startUpload} />
        )}
        {hasData && view === 'home' && (
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 36px 60px' }}>
            <button className="btn-ghost" onClick={() => startUpload('brokerage')}>
              + Add another document
            </button>
          </div>
        )}
      </main>

      <footer className="disclaimer">
        VaultAdvisor provides educational analysis, not professional financial, tax, or legal
        advice. Verify with a qualified professional before acting. · Open source — stored on
        this machine, analyzed only by your own AI.
      </footer>

      {uploadKind && (
        <UploadFlow
          kind={uploadKind}
          onClose={() => setUploadKind(null)}
          onError={(m) => showToast(m, true)}
          onConfirmed={(thread, messages) => {
            setUploadKind(null)
            refresh()
            setChat({ thread, title: 'A few quick questions', initial: messages })
            showToast('Saved to your vault. New advice is lighting up.')
          }}
        />
      )}

      {openCard && (
        <CardDetail
          card={openCard}
          onClose={() => setOpenCard(null)}
          onToggle={async (id, done) => {
            const updated = await window.vault.checklist.toggle(id, done)
            setCards(updated)
            setOpenCard(updated.find((c) => c.id === openCard.id) ?? null)
          }}
          onChatAbout={(c) => {
            setOpenCard(null)
            setChat({ thread: 'advisor', title: `About: ${c.title}` })
          }}
        />
      )}

      {chat && (
        <ChatPanel
          thread={chat.thread}
          title={chat.title}
          initialMessages={chat.initial}
          onClose={() => {
            setChat(null)
            refresh()
          }}
        />
      )}

      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function AuthChip(props: {
  auth: AuthStatus | null
  checking: boolean
  onSignIn: () => void
  onRecheck: () => void
}): React.JSX.Element {
  const { auth } = props
  if (!auth) return <span className="authchip">…</span>
  if (auth.authenticated) {
    return <span className="authchip">◈ {auth.detail ?? 'Claude connected'}</span>
  }
  return (
    <span className="authchip">
      <button className="btn-ghost" onClick={props.onSignIn}>
        Sign in with Claude
      </button>
      <button className="btn-quiet" onClick={props.onRecheck} disabled={props.checking}>
        {props.checking ? 'checking…' : 're-check'}
      </button>
      <span title="Sign in with ChatGPT is not yet open to third-party apps" style={{ opacity: 0.5 }}>
        OpenAI soon
      </span>
    </span>
  )
}
