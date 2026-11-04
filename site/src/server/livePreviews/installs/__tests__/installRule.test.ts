/** What the install rule decides for a package with an install script (adr-0170): runs, or stays off and why. */
import { describe, expect, it } from 'vitest'
import { BUILT_IN_SCRIPT_PACKAGES, INSTALL_RULE, type PackageFacts } from '@agenthix/core'
import { installInPreview, type ExecAnswer, type InstallDeps } from '../previewInstall'

const NOW = Date.parse('2026-11-01T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const target = { id: 'lp-rule', root: '/projects/p1/clones/c1' }
const input = { folder: '.', manager: 'npm' as const, packages: [], dev: false }

const scan = (name: string, version: string, origin: unknown) => JSON.stringify({
  packages: [{ dir: `node_modules/${name}`, folder: name, name, version, scripts: ['install'], gyp: false, origin, specs: [`^${version}`] }],
})
const registry = (name: string, version: string) => ({ kind: 'npm', resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, version })

const clean = (name: string): PackageFacts => ({
  ecosystem: 'npm', name, version: '1.0.0', publishedAt: new Date(NOW - (INSTALL_RULE.minAgeDays + 30) * DAY).toISOString(),
  weeklyDownloads: INSTALL_RULE.minWeeklyDownloads + 1_000, advisories: [], publisher: 'a', previousPublisher: 'a',
})

function run(scanOut: string, facts: (name: string) => Promise<PackageFacts | null>) {
  const rebuilds: string[][] = []
  const deps: InstallDeps = {
    exec: async (_lp, argv): Promise<ExecAnswer> => {
      if (argv[0] === 'node') return { exitCode: 0, stdout: scanOut, stderr: '' }
      if (argv[1] === 'rebuild') rebuilds.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
    facts,
    trustedScopes: async () => [],
    now: () => NOW,
  }
  return installInPreview(target, input, deps).then(report => ({ report, rebuilds }))
}

describe('the install rule\'s outcomes @SC-1745', () => {
  it('runs the script of a widely used, old package with no advisories', async () => {
    const { report, rebuilds } = await run(scan('leftpad', '1.0.0', registry('leftpad', '1.0.0')), async n => clean(n))
    expect(report.installed && report.ran.map(r => r.why)).toEqual(['rule'])
    expect(rebuilds).toHaveLength(1)
  })

  it('keeps a script off when the registry cannot be reached', async () => {
    const { report, rebuilds } = await run(scan('leftpad', '1.0.0', registry('leftpad', '1.0.0')), async () => null)
    expect(report.installed && report.blocked.map(b => 'registryUnreachable' in b.verdict)).toEqual([true])
    expect(rebuilds).toEqual([])
  })

  it('keeps a script off for a package that is too new, has few downloads, or has an advisory', async () => {
    const cases: Array<[Partial<PackageFacts>, string]> = [
      [{ publishedAt: new Date(NOW - DAY).toISOString() }, 'tooNew'],
      [{ weeklyDownloads: 1 }, 'fewDownloads'],
      [{ advisories: ['GHSA-x'] }, 'advisories'],
      [{ publisher: 'b' }, 'publisherChanged'],
    ]
    for (const [change, reason] of cases) {
      const { report, rebuilds } = await run(scan('leftpad', '1.0.0', registry('leftpad', '1.0.0')), async n => ({ ...clean(n), ...change }))
      const verdict = report.installed ? report.blocked[0]?.verdict : null
      expect(verdict && 'reasons' in verdict && verdict.reasons).toContain(reason)
      expect(rebuilds).toEqual([])
    }
  })

  it('never looks up a built-in package, and runs its script', async () => {
    const name = BUILT_IN_SCRIPT_PACKAGES[0]!
    const { report } = await run(scan(name, '1.0.0', registry(name, '1.0.0')), async () => { throw new Error('looked up') })
    expect(report.installed && report.ran.map(r => r.why)).toEqual(['builtIn'])
  })

  it('keeps a script off for a package whose origin is not the public registry', async () => {
    const { report, rebuilds } = await run(scan('leftpad', '1.0.0', { kind: 'git', resolved: 'git+https://example.com/x.git' }), async n => clean(n))
    expect(report.installed && report.blocked).toHaveLength(1)
    expect(rebuilds).toEqual([])
  })
})
