import { describe, expect, it } from 'vitest'
import {
  installScriptAllowedStep, installScriptQuestion, isNpmPackageName, judgeInstallScript, MAX_TRUSTED_PACKAGE_SCOPES, packageFactsKey,
  readPackageScopes, type PackageFacts,
} from '../installScripts.js'

const NOW = Date.parse('2026-10-29T12:00:00Z')
const DAY = 86_400_000
const facts = (over: Partial<PackageFacts> = {}): PackageFacts => ({
  ecosystem: 'npm', name: 'left-pad-pro', version: '1.0.1', publishedAt: new Date(NOW - 400 * DAY).toISOString(),
  weeklyDownloads: 50_000, advisories: [], publisher: 'mia', previousPublisher: 'mia', ...over,
})
const judge = (name: string, f: PackageFacts | null, trustedScopes: string[] = []) => judgeInstallScript(name, f, { now: NOW, trustedScopes })

describe('the install-script rule @SC-1744', () => {
  it('lets a well-known package\'s script run without a lookup', () => {
    expect(judge('esbuild', null)).toEqual({ allowed: true, why: 'builtIn' })
    expect(installScriptAllowedStep('esbuild', 'builtIn')).toBe('Allowed esbuild\'s install script (it is on the built-in list of well-known packages that need their scripts).')
    expect(installScriptAllowedStep('esbuild', 'builtIn')).not.toMatch(/no known issues/)
  })

  it('words a package that passed the rule by what was checked', () => {
    expect(installScriptAllowedStep('left-pad-pro', 'rule')).toBe('Allowed left-pad-pro\'s install script (widely used, no known issues).')
    expect(installScriptAllowedStep('@acme/x', 'trustedScope')).toBe('Allowed @acme/x\'s install script (your organisation trusts its scope).')
  })

  it('passes an old, widely used package with no advisories from the same publisher', () => {
    expect(judge('left-pad-pro', facts())).toEqual({ allowed: true, why: 'rule' })
    expect(judge('left-pad-pro', facts({ previousPublisher: undefined }))).toEqual({ allowed: true, why: 'rule' })
  })

  it('blocks a 2-day-old package with 40 downloads, and asks in plain words', () => {
    const f = facts({ publishedAt: new Date(NOW - 2 * DAY).toISOString(), weeklyDownloads: 40 })
    const verdict = judge('left-pad-pro', f)
    expect(verdict).toEqual({ allowed: false, reasons: ['tooNew', 'fewDownloads'] })
    expect(installScriptQuestion(f, verdict, NOW))
      .toBe('left-pad-pro is 2 days old, has 40 downloads a week and runs code when installed. I recommend not using it.')
  })

  it('blocks advisories, a new publisher, exactly 1,000 downloads, and a fact it could not get', () => {
    expect(judge('x', facts({ advisories: ['GHSA-1'] }))).toEqual({ allowed: false, reasons: ['advisories'] })
    expect(judge('x', facts({ publisher: 'mallory' }))).toEqual({ allowed: false, reasons: ['publisherChanged'] })
    expect(judge('x', facts({ weeklyDownloads: 1000 }))).toEqual({ allowed: false, reasons: ['fewDownloads'] })
    expect(judge('x', facts({ advisories: null }))).toEqual({ allowed: false, reasons: ['unknown'] })
  })

  it('keeps scripts off with the registry unreachable, and says why', () => {
    const verdict = judge('left-pad-pro', null)
    expect(verdict).toEqual({ allowed: false, registryUnreachable: true })
    expect(installScriptQuestion(null, verdict, NOW)).toMatch(/could not be reached/)
  })

  it('trusts an organisation\'s own scope, and only that scope', () => {
    expect(judge('@fernhill/ui', null, ['@fernhill'])).toEqual({ allowed: true, why: 'trustedScope' })
    expect(judge('@fernhill-evil/ui', null, ['@fernhill'])).toEqual({ allowed: false, registryUnreachable: true })
    expect(judge('fernhill', null, ['@fernhill'])).toEqual({ allowed: false, registryUnreachable: true })
  })

  it('keeps facts once per package version, and knows a package name', () => {
    expect(packageFactsKey('npm', '@a/b', '1.0.0')).toBe('npm:@a/b@1.0.0')
    expect(isNpmPackageName('@fernhill/ui')).toBe(true)
    expect(isNpmPackageName('../evil')).toBe(false)
  })
})

describe("the organisation's trusted scopes @SC-1744 @SC-1711", () => {
  it('are read only as a short list of distinct npm scopes', () => {
    expect(readPackageScopes([])).toEqual([])
    expect(readPackageScopes(['@fernhill', '@acme-co'])).toEqual(['@fernhill', '@acme-co'])
    expect(readPackageScopes(['@fernhill', '@fernhill'])).toBeNull()
    for (const bad of ['fernhill', '@Fernhill', '@', '@fern/ui', ' @fernhill', '@fern hill']) expect(readPackageScopes([bad])).toBeNull()
    expect(readPackageScopes(Array.from({ length: MAX_TRUSTED_PACKAGE_SCOPES + 1 }, (_, i) => `@s${i}`))).toBeNull()
    expect(readPackageScopes('@fernhill')).toBeNull()
    expect(readPackageScopes(null)).toBeNull()
  })
})
