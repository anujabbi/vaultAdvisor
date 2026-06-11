import { app } from 'electron'
import { spawn } from 'child_process'
import type { AuthStatus } from '../../shared/types'
import { resolveClaudeCli } from './cliPath'
import type { GenerateOptions, LlmProvider } from './provider'

type AgentSdk = typeof import('@anthropic-ai/claude-agent-sdk')

// The Agent SDK is ESM-only; the Electron main bundle is CJS, so load it
// with a dynamic import (preserved as import() in the CJS output).
let sdkPromise: Promise<AgentSdk> | null = null
function loadSdk(): Promise<AgentSdk> {
  sdkPromise ??= import('@anthropic-ai/claude-agent-sdk')
  return sdkPromise
}

/**
 * Claude provider — uses the Claude Agent SDK with the user's own
 * "Sign in with Claude" subscription credential (stored by the bundled
 * Claude runtime in the user's profile). No API keys are handled by
 * VaultAdvisor, ever.
 */
export class ClaudeProvider implements LlmProvider {
  readonly id = 'claude' as const
  private cachedStatus: AuthStatus | null = null

  /**
   * Locate the Claude CLI: packaged extraResources copy, dev node_modules,
   * or a global `claude` on PATH. Used for the sign-in flow AND passed to
   * the SDK so packaged apps never depend on its internal lookup.
   */
  private cliPath(): string | undefined {
    return resolveClaudeCli({
      platform: process.platform,
      arch: process.arch,
      resourcesPath: app.isPackaged ? process.resourcesPath : undefined,
      appPath: app.getAppPath()
    })
  }

  /** SDK options ensuring queries use the same CLI binary we resolved. */
  private sdkPathOptions(): { pathToClaudeCodeExecutable?: string } {
    const cli = this.cliPath()
    return cli ? { pathToClaudeCodeExecutable: cli } : {}
  }

  async status(): Promise<AuthStatus> {
    if (this.cachedStatus?.authenticated) return this.cachedStatus
    try {
      const { query } = await loadSdk()
      const q = query({
        prompt: 'ping',
        options: { maxTurns: 1, allowedTools: [], settingSources: [], ...this.sdkPathOptions() }
      })
      const info = await q.accountInfo()
      q.close()
      this.cachedStatus = {
        provider: 'claude',
        authenticated: !!info?.email,
        detail: info?.email
          ? `${info.email}${info.subscriptionType ? ` (${info.subscriptionType})` : ''}`
          : undefined
      }
    } catch (e) {
      this.cachedStatus = {
        provider: 'claude',
        authenticated: false,
        detail: e instanceof Error ? e.message : String(e)
      }
    }
    return this.cachedStatus
  }

  async signIn(): Promise<void> {
    this.cachedStatus = null
    const cli = this.cliPath()
    if (!cli) {
      throw new Error(
        'Claude runtime not found. Reinstall VaultAdvisor, or install Claude Code (claude.com/code) and try again.'
      )
    }
    // Open a visible terminal running the interactive Claude login.
    // The user completes the browser OAuth there; the SDK then picks up
    // the stored credential. The renderer re-checks status afterwards.
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'Sign in with Claude', cli, '/login'], {
        detached: true,
        stdio: 'ignore',
        shell: false
      }).unref()
    } else {
      spawn('osascript', ['-e', `tell application "Terminal" to do script "${cli} /login"`], {
        detached: true,
        stdio: 'ignore'
      }).unref()
    }
  }

  async extract(filePath: string, instructions: string): Promise<string> {
    const prompt = [
      `Read the document at this exact path: ${filePath}`,
      '',
      instructions,
      '',
      'Respond with ONLY the JSON object, no prose, no markdown fences.'
    ].join('\n')
    return this.run(prompt, { tools: ['Read'] })
  }

  async generate(prompt: string, opts?: GenerateOptions): Promise<string> {
    return this.run(prompt, {
      tools: opts?.webSearch ? ['WebSearch', 'WebFetch'] : [],
      system: opts?.system,
      onDelta: opts?.onDelta
    })
  }

  private async run(
    prompt: string,
    cfg: { tools: string[]; system?: string; onDelta?: (t: string) => void }
  ): Promise<string> {
    const { query } = await loadSdk()
    const q = query({
      prompt,
      options: {
        maxTurns: cfg.tools.length > 0 ? 12 : 1,
        allowedTools: cfg.tools,
        permissionMode: 'bypassPermissions',
        settingSources: [],
        ...this.sdkPathOptions(),
        ...(cfg.system ? { systemPrompt: cfg.system } : {})
      }
    })
    let lastText = ''
    let resultText = ''
    for await (const msg of q) {
      const m = msg as { type: string; [k: string]: unknown }
      if (m.type === 'assistant') {
        const content = (m as any).message?.content as { type: string; text?: string }[] | undefined
        const text = (content ?? [])
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text)
          .join('')
        if (text) {
          lastText = text
          cfg.onDelta?.(text)
        }
      } else if (m.type === 'result') {
        const r = m as any
        if (r.subtype === 'success' && typeof r.result === 'string') resultText = r.result
        if (r.is_error) {
          throw new Error(typeof r.result === 'string' ? r.result : 'Claude request failed')
        }
      }
    }
    return resultText || lastText
  }
}

/** Extract the first JSON object from model output, tolerating fences/prose. */
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output')
  return JSON.parse(candidate.slice(start, end + 1)) as T
}
