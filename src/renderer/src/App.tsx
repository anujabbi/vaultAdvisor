import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { AccountsPage } from './components/AccountsPage'

type View = 'home' | 'profile' | 'accounts'

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
  const [adviceConsent, setAdviceConsent] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const profilingStarted = useRef(false)

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([window.vault.portfolio.summary(), window.vault.cards.list()])
    setSummary(s)
    setCards(c)
  }, [])

  useEffect(() => {
    window.vault.sample.scenarios().then(setScenarios)
    window.vault.auth.status().then(setAuth)
    window.vault.vaults.current().then(setVault)
    window.vault.advice.consentGet().then(setAdviceConsent)
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

  // Phase 1 is offline — uploading needs no sign-in.
  function startUpload(kind: DocKind): void {
    setUploadKind(kind)
  }

  // Phase 2 gate: advice/profiling/chat require explicit consent + sign-in.
  async function ensureAdvice(): Promise<boolean> {
    if (!adviceConsent) {
      setShowConsent(true)
      return false
    }
    const a = auth ?? (await window.vault.auth.status())
    setAuth(a)
    if (!a.authenticated) {
      showToast('Sign in with Claude to get advice.', true)
      return false
    }
    return true
  }

  async function maybeStartProfiling(): Promise<void> {
    if (profilingStarted.current || !hasData) return
    profilingStarted.current = true
    try {
      const msgs = await window.vault.advice.startProfiling()
      setChat({ thread: 'profiling:main', title: 'A few quick questions', initial: msgs })
    } catch (e) {
      profilingStarted.current = false
      showToast(e instanceof Error ? e.message : String(e), true)
    }
  }

  async function openAdvisorChat(title: string): Promise<void> {
    if (!(await ensureAdvice())) return
    setChat({ thread: 'advisor', title })
  }

  async function generate(domain: AdviceDomain): Promise<void> {
    if (!(await ensureAdvice())) return
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
        {hasData && (
          <button className={`navbtn ${view === 'accounts' ? 'active' : ''}`} onClick={() => setView('accounts')}>
            Accounts
          </button>
        )}
        <button className={`navbtn ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}>
          Profile
        </button>
        {hasData && (
          <button className="navbtn" onClick={() => openAdvisorChat('Your advisor')}>
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
        ) : view === 'accounts' ? (
          <AccountsPage onChanged={refresh} />
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
          onConfirmed={() => {
            setUploadKind(null)
            refresh()
            showToast('Saved to your vault.')
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
            openAdvisorChat(`About: ${c.title}`)
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

      {showConsent && (
        <div className="overlay" onClick={() => setShowConsent(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="serif" style={{ fontSize: 26, marginBottom: 10 }}>
              Turn on advice?
            </h2>
            <p style={{ color: 'var(--parchment-dim)', fontSize: 14, marginBottom: 8 }}>
              To analyze your finances, VaultAdvisor sends your <strong>de-identified summary</strong>{' '}
              — holdings, amounts, and tax brackets — to your own Claude account. It never sends
              account numbers or your SSN. Only the last 4 digits of an account number are stored,
              locally on this machine, and they are never sent.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              <button
                className="btn-brass"
                onClick={async () => {
                  await window.vault.advice.consentSet(true)
                  setAdviceConsent(true)
                  setShowConsent(false)
                  const a = auth ?? (await window.vault.auth.status())
                  setAuth(a)
                  if (a.authenticated) maybeStartProfiling()
                  else showToast('Advice is on. Sign in with Claude to begin.')
                }}
              >
                Enable advice
              </button>
              <button className="btn-quiet" onClick={() => setShowConsent(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
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
