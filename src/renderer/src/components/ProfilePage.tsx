import React, { useEffect, useState } from 'react'
import type { ProfileFact } from '../../../shared/types'

export function ProfilePage(): React.JSX.Element {
  const [facts, setFacts] = useState<ProfileFact[]>([])
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  useEffect(() => {
    window.vault.profile.list().then(setFacts)
  }, [])

  async function save(key: string, value: string): Promise<void> {
    setFacts(await window.vault.profile.set(key, value))
  }

  return (
    <div className="profile">
      <h2 className="serif" style={{ fontSize: 30, marginBottom: 6 }}>
        What your advisor knows about you
      </h2>
      <p style={{ color: 'var(--parchment-dim)', fontSize: 14, marginBottom: 26 }}>
        Built from your conversations, editable any time. Every recommendation cites which of
        these it relied on.
      </p>

      {facts.length === 0 && (
        <p style={{ color: 'var(--parchment-faint)', fontStyle: 'italic' }}>
          Nothing yet — upload a document and answer a couple of questions, or add facts manually
          below.
        </p>
      )}

      {facts.map((f) => (
        <div className="fact-row" key={f.key}>
          <span className="key">{f.key}</span>
          <input defaultValue={f.value} onBlur={(e) => e.target.value !== f.value && save(f.key, e.target.value)} />
          <span className="src">{f.source}</span>
        </div>
      ))}

      <div className="fact-row" style={{ borderBottom: 'none', marginTop: 10 }}>
        <input placeholder="new_fact_key" value={newKey} onChange={(e) => setNewKey(e.target.value.replace(/\s+/g, '_').toLowerCase())} />
        <input placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        <button
          className="btn-ghost"
          disabled={!newKey || !newValue}
          onClick={() => {
            save(newKey, newValue)
            setNewKey('')
            setNewValue('')
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
