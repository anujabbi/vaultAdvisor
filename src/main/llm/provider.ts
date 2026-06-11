import type { AuthStatus } from '../../shared/types'

export interface GenerateOptions {
  /** Allow the model to use web search to gather citations. */
  webSearch?: boolean
  /** System prompt override. */
  system?: string
  /** Called with incremental text as it arrives. */
  onDelta?: (text: string) => void
}

/**
 * Seam for LLM providers. Claude (via the user's own "Sign in with Claude"
 * subscription) is the only v1 implementation; OpenAI lands here when
 * Sign in with ChatGPT becomes generally available to third-party apps.
 */
export interface LlmProvider {
  readonly id: 'claude' | 'openai'
  status(): Promise<AuthStatus>
  /** Launch the interactive sign-in flow (opens a terminal + browser). */
  signIn(): Promise<void>
  /** Parse a local document file into JSON matching the given instructions. */
  extract(filePath: string, instructions: string): Promise<string>
  /** One-shot generation returning the full text. */
  generate(prompt: string, opts?: GenerateOptions): Promise<string>
}
