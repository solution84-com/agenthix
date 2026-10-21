import { describe, it, expect } from 'vitest'
import { githubAdvice, runFailureAdvice, siteProblemAdvice } from '../errorAdvice'

describe('runFailureAdvice: what failed, and what to do, from a run\'s error @SC-726', () => {
  const cases: [string | null, string, RegExp][] = [
    ["Claude login expired for this run's person", 'login-expired', /renew it in Settings › Your model logins/],
    ['OAuth token has expired; refresh failed', 'login-expired', /renew it/],
    ['No model credential for this agent', 'no-credential', /Organisation › Model access/],
    ['401 invalid api key', 'credential-refused', /Model access/],
    ['Run limit reached: 200 turns', 'run-limit', /raise the limit/],
    ['429 rate_limit_error', 'rate-limit', /limit resets/],
    ['529 overloaded_error', 'provider-error', /passes by itself/],
    ['fetch failed: ECONNRESET', 'network', /reach the model provider/],
    ['prompt is too long: 210000 tokens', 'context-full', /new conversation/],
    ['claude process exited with code 137', 'process-stopped', /memory/],
    ['jwt expired', 'capability', /clocks/],
    ['package_unavailable: digest abc', 'package', /connected and up to date/],
    ['This conversation was closed because its person left', 'conversation-closed', /new conversation/],
    ['something nobody planned for', 'other', /logs of the site/],
    [null, 'other', /logs of the site/],
  ]
  for (const [error, kind, advice] of cases) {
    it(`${JSON.stringify(error)} → ${kind}`, () => {
      const a = runFailureAdvice(error)
      expect(a.kind).toBe(kind)
      expect(a.advice).toMatch(advice)
      expect(a.title).not.toBe('')
    })
  }

  it('groups the same failure the same way whatever its details', () => {
    expect(runFailureAdvice('429 from run a').kind).toBe(runFailureAdvice('rate limit hit on run b').kind)
  })
})

describe('siteProblemAdvice @SC-726', () => {
  it('names the site and says what fixes it', () => {
    expect(siteProblemAdvice('Build server 2', { kind: 'dockerDown' })).toMatchObject({
      title: 'Docker is not running on Build server 2',
      advice: 'Every run there fails until Docker is started on that machine.',
    })
    expect(siteProblemAdvice('Laptop', { kind: 'notConnectedWithWork', since: new Date() })?.title).toBe('Laptop is not connected')
    expect(siteProblemAdvice('Old', { kind: 'upgrade', protocolVersion: '0.2', side: 'site' })?.advice).not.toMatch(/0\.2/)
    expect(siteProblemAdvice('Old', { kind: 'upgrade', protocolVersion: '0.2', side: 'site' })?.title).toBe('Old needs upgrading')
    expect(siteProblemAdvice('New', { kind: 'upgrade', protocolVersion: '3.0', side: 'hq' })?.title).toBe('New needs a newer HQ')
    // A sentence, never the figures (host-management spec §10).
    expect(siteProblemAdvice('Disk', { kind: 'diskNearlyFull', freeBytes: 5e9, totalBytes: 500e9 })?.advice).not.toMatch(/\d GB/)
    expect(siteProblemAdvice("hq-box · HQ's site", { kind: 'hqSiteDown', since: new Date() })?.title).toBe("hq-box · HQ's site is not running")
  })

  it('is not an error for a removed site', () => {
    expect(siteProblemAdvice('Gone', { kind: 'removedWithProjects', projects: 2 })).toBeNull()
  })
})

describe('githubAdvice @SC-726', () => {
  it('says to give the App access when GitHub refuses a repository', () => {
    expect(githubAdvice(403).advice).toBe('Give the GitHub App access to that repository on GitHub.')
    expect(githubAdvice(404).kind).toBe('github-404')
    expect(githubAdvice(401).advice).toContain('GitHub App')
  })
})
