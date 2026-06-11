import type { Db } from '../store/db'
import {
  appendChatMessage,
  listCards,
  listChatMessages,
  listProfileFacts,
  setProfileFact
} from '../store/repos'
import type { AdvisorEngine } from '../advisor/engine'
import type { LlmProvider } from '../llm/provider'
import { parseJsonLoose } from '../llm/claudeProvider'
import { ADVISOR_SYSTEM, profileExtraction, profilingOpener } from '../advisor/prompts'
import type { ChatMessage } from '../../shared/types'

export class ChatService {
  constructor(
    private vm: { db: Db },
    private provider: LlmProvider,
    private engine: AdvisorEngine
  ) {}

  /** Always read through the holder so vault switches take effect live. */
  private get db(): Db {
    return this.vm.db
  }

  history(thread: string): ChatMessage[] {
    return listChatMessages(this.db, thread)
  }

  /** Open a profiling conversation grounded in a just-confirmed upload. */
  async openProfiling(docId: number, kind: string, dataSummary: string): Promise<ChatMessage[]> {
    const thread = `profiling:${docId}`
    const opener = await this.provider.generate(profilingOpener(kind, dataSummary), {
      system: ADVISOR_SYSTEM
    })
    appendChatMessage(this.db, thread, 'assistant', opener)
    return this.history(thread)
  }

  async send(thread: string, userText: string, onDelta?: (t: string) => void): Promise<ChatMessage[]> {
    appendChatMessage(this.db, thread, 'user', userText)
    const transcript = this.history(thread)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n')

    const context = this.assembleContext()
    const prompt = `${context}

CONVERSATION SO FAR:
${transcript}

Reply as the advisor. Be concrete, use the exact numbers from CONTEXT when relevant,
and keep it under 250 words unless asked for depth.${
      thread.startsWith('profiling:')
        ? '\nThis is a profiling conversation: acknowledge their answer and ask the next single most useful question (or wrap up if you have enough).'
        : ''
    }`

    const reply = await this.provider.generate(prompt, { system: ADVISOR_SYSTEM, onDelta })
    appendChatMessage(this.db, thread, 'assistant', reply)

    // After profiling turns, harvest durable facts in the background of the same call.
    if (thread.startsWith('profiling:')) {
      await this.extractFacts(transcript + `\n\nASSISTANT: ${reply}`)
    }
    return this.history(thread)
  }

  private async extractFacts(conversation: string): Promise<void> {
    try {
      const raw = await this.provider.generate(profileExtraction(conversation))
      const parsed = parseJsonLoose<{ facts: { key: string; value: string }[] }>(raw)
      for (const f of parsed.facts ?? []) {
        if (f.key && f.value) {
          setProfileFact(this.db, { key: f.key, value: f.value, source: 'conversation' })
        }
      }
    } catch {
      // fact extraction is best-effort; the conversation itself is preserved
    }
  }

  private assembleContext(): string {
    const s = this.engine.summary()
    const profile = listProfileFacts(this.db)
    const cards = listCards(this.db).filter((c) => c.status === 'generated')
    return `CONTEXT (user's local data):
Portfolio: ${JSON.stringify(s)}
Profile: ${JSON.stringify(profile)}
Active advice: ${cards.map((c) => `${c.domain}: ${c.summary}`).join(' | ') || 'none yet'}`
  }
}
