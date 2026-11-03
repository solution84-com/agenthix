/**
 * A person's yes on a branch's package card (adr-0170) holds for the branch: the next install in a fresh copy of the
 * same branch runs that version's script, and an install in another branch's copy does not.
 */
import { describe, expect, it } from 'vitest'
import type { InstallScriptVerdict, PackageFacts } from '@agenthix/core'
import { acceptPackageUse, askPerson, askPersonInCopy, branchKey, copyKey, recordBlocked } from '../packages'
import { installInPreview, type ExecAnswer, type InstallDeps, type InstallTarget } from '../previewInstall'

const workspace = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w-allow' }
const verdict = { allowed: false, reasons: ['advisories'] } as unknown as InstallScriptVerdict
const SCAN = JSON.stringify({
  packages: [{
    dir: 'node_modules/re2', folder: 're2', name: 're2', version: '1.15.0', scripts: ['install'], gyp: false,
    origin: { kind: 'npm', resolved: 'https://registry.npmjs.org/re2/-/re2-1.15.0.tgz', version: '1.15.0' }, specs: ['^1.15.0'],
  }],
})
const RISKY: PackageFacts = {
  ecosystem: 'npm', name: 're2', version: '1.15.0', publishedAt: '2020-01-01T00:00:00.000Z', weeklyDownloads: 500_000,
  advisories: ['GHSA-x'], publisher: 'a', previousPublisher: 'a',
}

function deps(rebuilds: string[][]): InstallDeps {
  return {
    exec: async (_lp, argv): Promise<ExecAnswer> => {
      if (argv[0] === 'node') return { exitCode: 0, stdout: SCAN, stderr: '' }
      if (argv[1] === 'rebuild') rebuilds.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
    facts: async () => RISKY,
    trustedScopes: async () => [],
    now: () => Date.parse('2026-11-01T00:00:00Z'),
  }
}

const inCopy = (copyId: string, branch: string): InstallTarget => ({
  id: copyKey(copyId), root: `/projects/p1/clones/${copyId}`, branchKey: branchKey(workspace.workspaceId, branch),
})

describe('a yes on a branch\'s package card @SC-1745', () => {
  it('runs the script in the branch\'s next copy, and in no other branch\'s', async () => {
    const before: string[][] = []
    const first = await installInPreview(inCopy('copy-old', 'shop-2'), { folder: '.', manager: 'npm', packages: [], dev: false }, deps(before))
    expect(first.installed && first.blocked.map(b => b.name)).toEqual(['re2'])
    expect(before).toEqual([])
    askPersonInCopy({ workspace, copyId: 'copy-old', branch: 'shop-2' }, 'run-1', 're2', '1.15.0')
    // The run ended and its copy went; the person answers the card afterwards.
    expect(acceptPackageUse(branchKey(workspace.workspaceId, 'shop-2'), { ecosystem: 'npm', name: 're2', version: '1.15.0' })).toBe(true)

    const next: string[][] = []
    const again = await installInPreview(inCopy('copy-new', 'shop-2'), { folder: '.', manager: 'npm', packages: [], dev: false }, deps(next))
    expect(again.installed && again.ran.map(r => [r.name, r.why])).toEqual([['re2', 'person']])
    expect(next).toHaveLength(1)

    const other: string[][] = []
    const elsewhere = await installInPreview(inCopy('copy-x', 'shop-3'), { folder: '.', manager: 'npm', packages: [], dev: false }, deps(other))
    expect(elsewhere.installed && elsewhere.blocked.map(b => b.name)).toEqual(['re2'])
    expect(other).toEqual([])
  })

  it("keeps the strip's yes in a live preview for its branch: it counts in the branch's copies too", async () => {
    const live = { id: 'lp-strip', root: '/projects/p1/clones/c-lp', branchKey: branchKey(workspace.workspaceId, 'shop-5') }
    await installInPreview(live, { folder: '.', manager: 'npm', packages: [], dev: false }, deps([]))
    expect(askPerson('lp-strip', 'run-1', 're2', '1.15.0')).not.toBeNull()
    expect(acceptPackageUse('lp-strip', { ecosystem: 'npm', name: 're2', version: '1.15.0' }, branchKey(workspace.workspaceId, 'shop-5'))).toBe(true)

    const ran: string[][] = []
    const inCopyAfter = await installInPreview(inCopy('copy-5', 'shop-5'), { folder: '.', manager: 'npm', packages: [], dev: false }, deps(ran))
    expect(inCopyAfter.installed && inCopyAfter.ran.map(r => [r.name, r.why])).toEqual([['re2', 'person']])
    const other: string[][] = []
    await installInPreview(inCopy('copy-6', 'shop-6'), { folder: '.', manager: 'npm', packages: [], dev: false }, deps(other))
    expect(other).toEqual([])
  })

  it('needs the agent to have asked on that branch first', () => {
    recordBlocked(copyKey('copy-q'), { name: 'quiet', version: '1.0.0', verdict, facts: null, question: '?' })
    expect(acceptPackageUse(branchKey(workspace.workspaceId, 'shop-4'), { ecosystem: 'npm', name: 'quiet', version: '1.0.0' })).toBe(false)
  })
})
