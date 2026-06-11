import { describe, expect, it } from 'vitest'
import { cliCandidates, resolveFrom } from '../src/main/llm/cliPath'

const winCtx = {
  platform: 'win32' as NodeJS.Platform,
  arch: 'x64',
  resourcesPath: 'C:\\app\\resources',
  appPath: 'C:\\dev\\vaultAdvisor'
}

describe('cliCandidates', () => {
  it('prefers the packaged extraResources binary, then dev node_modules', () => {
    const c = cliCandidates(winCtx)
    expect(c[0]).toBe('C:\\app\\resources\\claude\\claude.exe')
    expect(c[1]).toContain('node_modules')
    expect(c[1]).toContain('claude-agent-sdk-win32-x64')
    expect(c[1].endsWith('claude.exe')).toBe(true)
  })

  it('uses unsuffixed binary name on mac', () => {
    const c = cliCandidates({
      platform: 'darwin',
      arch: 'arm64',
      resourcesPath: '/Applications/VaultAdvisor.app/Contents/Resources',
      appPath: '/dev/vaultAdvisor'
    })
    // path.join uses host separators; normalize for a platform-agnostic assertion
    expect(c[0].replace(/\\/g, '/')).toBe(
      '/Applications/VaultAdvisor.app/Contents/Resources/claude/claude'
    )
    expect(c[0].endsWith('claude')).toBe(true)
    expect(c[0].endsWith('claude.exe')).toBe(false)
    expect(c[1]).toContain('claude-agent-sdk-darwin-arm64')
  })

  it('omits resources candidate when resourcesPath is missing', () => {
    const c = cliCandidates({ ...winCtx, resourcesPath: undefined })
    expect(c.every((p) => !p.includes('C:\\app\\resources'))).toBe(true)
  })
})

describe('resolveFrom', () => {
  it('returns the first existing candidate', () => {
    const exists = (p: string): boolean => p === 'B'
    expect(resolveFrom(['A', 'B', 'C'], exists, () => undefined)).toBe('B')
  })

  it('falls back to the PATH-resolved claude when no candidate exists', () => {
    expect(resolveFrom(['A'], () => false, () => 'C:\\global\\claude.exe')).toBe(
      'C:\\global\\claude.exe'
    )
  })

  it('returns undefined when nothing is found anywhere', () => {
    expect(resolveFrom(['A'], () => false, () => undefined)).toBeUndefined()
  })
})
