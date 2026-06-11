import React, { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../../shared/types'

export function ChatPanel(props: {
  thread: string
  title: string
  initialMessages?: ChatMessage[]
  onClose: () => void
}): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages ?? [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!props.initialMessages) {
      window.vault.chat.history(props.thread).then(setMessages)
    }
  }, [props.thread])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setMessages((m) => [
      ...m,
      { id: -1, thread: props.thread, role: 'user', content: text, createdAt: '' }
    ])
    try {
      const updated = await window.vault.chat.send(props.thread, text)
      setMessages(updated)
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: -2,
          thread: props.thread,
          role: 'assistant',
          content: `Something went wrong: ${e instanceof Error ? e.message : e}. Try again.`,
          createdAt: ''
        }
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="drawer">
      <div className="chat-head">
        <h3 className="serif">{props.title}</h3>
        <span style={{ flex: 1 }} />
        <button className="btn-quiet" onClick={props.onClose}>
          ✕
        </button>
      </div>
      <div className="chat-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="who">{m.role === 'user' ? 'You' : 'Advisor'}</div>
            <div className="msg">{m.content}</div>
          </div>
        ))}
        {busy && (
          <div className="bubble assistant">
            <div className="who">Advisor</div>
            <div className="msg">
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="chat-foot">
        <textarea
          placeholder="Ask anything about your money…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button className="btn-brass" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
