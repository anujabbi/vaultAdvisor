// Resolution of the Claude CLI binary used for both the sign-in flow and
// (via pathToClaudeCodeExecutable) every Agent SDK query. Order:
//   1. extraResources copy shipped with the packaged app (resources/claude/)
//   2. the platform package in node_modules (dev / npm run)
//   3. a `claude` install on the user's PATH
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export interface CliContext {
  platform: NodeJS.Platform
  arch: string
  /** process.resourcesPath — undefined outside a packaged Electron app */
  resourcesPath: string | undefined
  /** app.getAppPath() in dev, or the project root for tests */
  appPath: string
}

export function cliCandidates(ctx: CliContext): string[] {
  const bin = ctx.platform === 'win32' ? 'claude.exe' : 'claude'
  const candidates: string[] = []
  if (ctx.resourcesPath) {
    candidates.push(join(ctx.resourcesPath, 'claude', bin))
  }
  candidates.push(
    join(
      ctx.appPath,
      'node_modules',
      '@anthropic-ai',
      `claude-agent-sdk-${ctx.platform}-${ctx.arch}`,
      bin
    )
  )
  return candidates
}

export function resolveFrom(
  candidates: string[],
  exists: (p: string) => boolean,
  fromPath: () => string | undefined
): string | undefined {
  return candidates.find(exists) ?? fromPath()
}

/** Locate `claude` on the user's PATH (e.g. a global Claude Code install). */
export function claudeOnPath(platform: NodeJS.Platform = process.platform): string | undefined {
  try {
    const cmd = platform === 'win32' ? 'where.exe' : 'which'
    const out = execFileSync(cmd, ['claude'], { encoding: 'utf8' }).trim()
    const first = out.split(/\r?\n/).find((l) => l.trim().length > 0)
    return first?.trim()
  } catch {
    return undefined
  }
}

export function resolveClaudeCli(ctx: CliContext): string | undefined {
  return resolveFrom(cliCandidates(ctx), existsSync, () => claudeOnPath(ctx.platform))
}
