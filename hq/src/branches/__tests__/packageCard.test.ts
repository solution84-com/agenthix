/** Reading a site's `branch.packageBlocked`, and HQ's own question for it (adr-0170). */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onSiteEvent: () => {} }))
vi.mock('../../conversations/store/messages', () => ({ appendMessage: vi.fn() }))
vi.mock('../../conversations/coordinator/events', () => ({ conversationEvents: {} }))
vi.mock('../../conversations/coordinator/continuationChecks', () => ({ boundaryName: vi.fn() }))
vi.mock('../../conversations/coordinator/cards', () => ({ approvalLine: vi.fn() }))
vi.mock('../../conversations/coordinator/notify', () => ({ notifyCard: vi.fn() }))
vi.mock('../../conversations/work/settle', () => ({ outstandingOperations: vi.fn() }))
vi.mock('../mergeCard', () => ({ cardConversation: vi.fn() }))
vi.mock('../working', () => ({ runsOnBranches: vi.fn() }))

import type { InstallScriptVerdict } from '@agenthix/core'
import { packageQuestion, parsePackageBlocked } from '../packageCard'

const COPY = '0f8a4c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b'
const frame = {
  workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, copyId: COPY, branch: 'add-login-page', runId: 'run-1',
  package: { ecosystem: 'npm', name: 'left-pad-ng', version: '1.0.0' }, verdict: { allowed: false, reasons: ['tooNew'] },
  facts: null, question: 'The site\'s own words', at: '2026-11-02T00:00:00.000Z',
}

describe('branch.packageBlocked as hq reads it @SC-1710', () => {
  it('reads a frame of its shape', () => {
    expect(parsePackageBlocked(frame)).toMatchObject({ copyId: COPY, branch: 'add-login-page', runId: 'run-1', package: frame.package })
  })

  it('drops a frame naming anything but one npm version, or no run', () => {
    expect(parsePackageBlocked({ ...frame, package: { ecosystem: 'npm', name: 'x', version: 'latest || ../' } })).toBeNull()
    expect(parsePackageBlocked({ ...frame, runId: '' })).toBeNull()
    expect(parsePackageBlocked({ ...frame, copyId: '../other' })).toBeNull()
    expect(parsePackageBlocked({ ...frame, verdict: 'yes' })).toBeNull()
  })

  it('words the question itself, never with the site\'s sentence', () => {
    const verdict = { allowed: false, registryUnreachable: true } as unknown as InstallScriptVerdict
    const q = packageQuestion({ ecosystem: 'npm', name: 'left-pad-ng', version: '1.0.0' }, null, verdict)
    expect(q).not.toContain('site\'s own words')
    expect(q).toMatch(/runs code when installed/)
  })

  it('still asks plainly when the verdict cannot be read', () => {
    const q = packageQuestion({ ecosystem: 'npm', name: 'left-pad-ng', version: '1.0.0' }, null, null as unknown as InstallScriptVerdict)
    expect(q).toMatch(/left-pad-ng 1\.0\.0 runs code when installed/)
  })
})
