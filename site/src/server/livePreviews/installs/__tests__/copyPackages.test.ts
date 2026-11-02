import { beforeEach, describe, expect, it, vi } from 'vitest'

const placeWorkspace = vi.hoisted(() => vi.fn())
vi.mock('../../../branches/branchCalls', () => ({ placeWorkspace }))

import type { BranchPackageBlockedEvent, InstallScriptVerdict } from '@agenthix/core'
import { branchPackageUse } from '../copyPackages'
import { askPersonInCopy, branchKey, copyKey, personAllowed, recordBlocked, setCopyPackageBlockedTeller } from '../packages'

const COPY = '0f8a4c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b'
const workspace = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }
const verdict = { allowed: false, reasons: ['tooNew'] } as unknown as InstallScriptVerdict
const params = (over: Record<string, unknown> = {}) => ({
  workspace, copyId: COPY, branch: 'add-login-page', personId: 'u1',
  package: { ecosystem: 'npm', name: 'left-pad-ng', version: '1.0.0' }, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  placeWorkspace.mockResolvedValue({ ref: workspace, owner: '/o', ws: '/o/workspaces/w1' })
})

describe('a blocked package in a branch\'s copy with no live preview (adr-0170) @SC-1745', () => {
  it('is asked about with the copy\'s own record, and a person\'s yes lets that one version run', async () => {
    const told: BranchPackageBlockedEvent[] = []
    setCopyPackageBlockedTeller(e => told.push(e))
    recordBlocked(copyKey(COPY), { name: 'left-pad-ng', version: '1.0.0', verdict, facts: null, question: 'Let it run?' })
    expect(askPersonInCopy({ workspace, copyId: COPY, branch: 'add-login-page' }, 'run-1', 'left-pad-ng', '1.0.0')).not.toBeNull()
    expect(told).toEqual([expect.objectContaining({ workspace, copyId: COPY, branch: 'add-login-page', runId: 'run-1', package: { ecosystem: 'npm', name: 'left-pad-ng', version: '1.0.0' } })])

    await expect(branchPackageUse(params())).resolves.toEqual({ ok: true })
    expect(personAllowed(branchKey('w1', 'add-login-page'), 'left-pad-ng', '1.0.0')).toBe(true)
    // Answered once: a second yes finds nothing waiting.
    await expect(branchPackageUse(params())).resolves.toEqual({ ok: false, refusal: { code: 'noPackage' } })
  })

  it('never asks about a package the rule did not block there', () => {
    expect(askPersonInCopy({ workspace, copyId: COPY, branch: 'add-login-page' }, 'run-1', 'never-blocked', '1.0.0')).toBeNull()
  })

  it('refuses a yes nobody was asked for', async () => {
    await expect(branchPackageUse(params({ package: { ecosystem: 'npm', name: 'other', version: '2.0.0' } })))
      .resolves.toEqual({ ok: false, refusal: { code: 'noPackage' } })
  })

  it('keeps the yes for the branch: it holds once the copy that asked is gone, for the branch\'s next copy only', async () => {
    const OLD = '1a1a1a1a-2b3d-4e5f-8a9b-0c1d2e3f4a5b'
    recordBlocked(copyKey(OLD), { name: 're2', version: '1.15.0', verdict, facts: null, question: 'Let it run?' })
    askPersonInCopy({ workspace, copyId: OLD, branch: 'shop-2' }, 'run-1', 're2', '1.15.0')
    // The run ended and its copy was removed: the card names a copy the site no longer holds.
    await expect(branchPackageUse(params({ branch: 'shop-2', copyId: OLD, package: { ecosystem: 'npm', name: 're2', version: '1.15.0' } })))
      .resolves.toEqual({ ok: true })
    expect(personAllowed(branchKey('w1', 'shop-2'), 're2', '1.15.0')).toBe(true)
    expect(personAllowed(branchKey('w1', 'other-branch'), 're2', '1.15.0')).toBe(false)
    expect(personAllowed(branchKey('w2', 'shop-2'), 're2', '1.15.0')).toBe(false)
    expect(personAllowed(branchKey('w1', 'shop-2'), 're2', '1.16.0')).toBe(false)
  })

  it('refuses a yes for a branch whose agent asked nothing, though another branch\'s did', async () => {
    recordBlocked(copyKey(COPY), { name: 'asked-elsewhere', version: '1.0.0', verdict, facts: null, question: 'Let it run?' })
    askPersonInCopy({ workspace, copyId: COPY, branch: 'add-login-page' }, 'run-1', 'asked-elsewhere', '1.0.0')
    await expect(branchPackageUse(params({ branch: 'another', package: { ecosystem: 'npm', name: 'asked-elsewhere', version: '1.0.0' } })))
      .resolves.toEqual({ ok: false, refusal: { code: 'noPackage' } })
  })

  it('refuses a workspace this site does not hold', async () => {
    placeWorkspace.mockRejectedValueOnce(new Error('outside'))
    await expect(branchPackageUse(params())).resolves.toEqual({ ok: false, refusal: { code: 'noCopy' } })
  })

  it('refuses params out of shape', async () => {
    await expect(branchPackageUse({ ...params(), extra: true })).resolves.toEqual({ ok: false, refusal: { code: 'malformed' } })
  })
})
