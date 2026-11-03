/**
 * Answering a package card (adr-0170): only a Member or Admin answers, *Allow* only by their own press, a second press
 * does nothing, and the site's refusal is worded by HQ. The person's standing, the branch's row and the site are
 * stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OperationEnd } from '../../conversations/contract'

const world = vi.hoisted(() => ({ members: new Set<string>(), branchOpen: true }))
vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } },
  prisma: { operation: { findUnique: async () => ({ boundaryType: 'project', boundaryId: 'p1' }) } },
}))
vi.mock('../workspaceAccess', () => ({ mayActIn: async (_ref: unknown, userId: string) => world.members.has(userId) }))
vi.mock('../workspaceLocation', () => ({ locateWorkspace: async () => ({ logicalSiteId: 'site-1', name: 'shop-app' }) }))
vi.mock('../branchRows', () => ({
  openBranchById: async () => (world.branchOpen ? { id: 'b1', workspaceId: 'w1', ownerType: 'project', ownerId: 'p1', name: 'add-login-page' } : null),
  refOfBranch: (b: { ownerType: string; ownerId: string; workspaceId: string }) => ({ ownerType: b.ownerType, ownerId: b.ownerId, workspaceId: b.workspaceId }),
}))
vi.mock('../../livePreviews/siteAsk', () => ({
  askSite: vi.fn(),
  SiteSilent: class SiteSilent extends Error {},
  SiteFailed: class SiteFailed extends Error {},
}))

import { ALLOW_BY_PRESS, allowedWords, answerPackageCard, packageAnswerRefusal } from '../packageCardAnswer'
import type { PackageCardArgs } from '../packageCardArgs'

const COPY = '0f8a4c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b'
const args: PackageCardArgs = {
  branchId: 'b1', workspaceId: 'w1', branch: 'add-login-page', copyId: COPY, name: 'left-pad-ng', version: '1.0.0',
  question: 'This package is 2 days old. I recommend not using it.', agentName: 'Kernel',
}
const row = { id: 'op-1', args: args as unknown as Record<string, unknown> }

let state: string
let ends: OperationEnd[]
let asked: unknown[]
let siteSays: boolean | 'noCopy' | 'noPackage'
const deps = () => ({
  async start() {
    if (state !== 'WAITING_FOR_APPROVAL') return false
    state = 'RUNNING'
    return true
  },
  async settle(_id: string, end: OperationEnd) { ends.push(end); state = end.state; return true },
  allow: async (siteId: string, params: unknown) => { asked.push({ siteId, params }); return siteSays },
})

beforeEach(() => {
  world.members = new Set(['member'])
  world.branchOpen = true
  state = 'WAITING_FOR_APPROVAL'
  ends = []
  asked = []
  siteSays = true
})

describe('who may answer a package card @SC-1710', () => {
  it('allows only by a person\'s own press, never through the agent', async () => {
    expect(await packageAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'approve', 'member', 'turn')).toBe(ALLOW_BY_PRESS)
    expect(await packageAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'approve', 'member', 'card')).toBeNull()
  })

  it('refuses a Viewer or a stranger', async () => {
    expect(await packageAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'approve', 'viewer', 'card')).toMatch(/Member or Admin/)
  })
})

describe('answering a package card @SC-1710', () => {
  it('Allow tells the workspace\'s site that one version, as the person who pressed', async () => {
    await answerPackageCard(row, 'approve', 'member', deps())
    expect(asked).toEqual([{ siteId: 'site-1', params: {
      workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, copyId: COPY, branch: 'add-login-page',
      personId: 'member', name: 'left-pad-ng', version: '1.0.0',
    } }])
    expect(ends).toEqual([{ state: 'COMPLETED', result: { summary: allowedWords(args) } }])
  })

  it('a second press does nothing', async () => {
    await answerPackageCard(row, 'approve', 'member', deps())
    await expect(answerPackageCard(row, 'approve', 'member', deps())).rejects.toThrow(/no longer waiting/)
    expect(asked).toHaveLength(1)
  })

  it('refuses a Viewer\'s press and changes nothing', async () => {
    await expect(answerPackageCard(row, 'approve', 'viewer', deps())).rejects.toThrow(/Member or Admin/)
    expect(asked).toHaveLength(0)
    expect(state).toBe('WAITING_FOR_APPROVAL')
  })

  it('words the site\'s refusal itself when nothing was waiting there', async () => {
    siteSays = 'noPackage'
    await expect(answerPackageCard(row, 'approve', 'member', deps())).rejects.toThrow(/no longer waiting there/)
    expect(ends[0]).toMatchObject({ state: 'FAILED' })
  })

  it('Not now keeps the script off and asks the site nothing', async () => {
    await answerPackageCard(row, 'decline', 'member', deps())
    expect(asked).toHaveLength(0)
    expect(ends[0]).toMatchObject({ state: 'CANCELLED', noReport: true })
  })

  it('refuses when the branch is not open any more', async () => {
    world.branchOpen = false
    await expect(answerPackageCard(row, 'approve', 'member', deps())).rejects.toThrow(/not open any more/)
    expect(asked).toHaveLength(0)
  })
})
