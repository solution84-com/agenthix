/**
 * resolve_git_credential over the data path, against the real test database:
 * a run is handed a repository token only for a repository its own boundary
 * owns — a kernel agent excepted — and never through a connection. Minting the
 * token is GitHub's, so that call is replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
const getTokenFor = vi.hoisted(() => vi.fn())
vi.mock('../../../github/githubApp', () => ({ getTokenFor }))

import { resolveGitCredentialOp } from '../runtimeOps'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { runCtx, chatCtx } from './controlPlaneFixtures'

const repo = { owner: 'acme', repo: 'widgets', workspaceId: null }
const projectRepo = { ownerType: 'project' as const, ownerId: 'proj-1', ...repo }

beforeEach(async () => {
  getTokenFor.mockReset().mockResolvedValue('ghs_token123')
  await prisma.agent.createMany({
    data: [{ id: 'agent-1', name: 'Agent', handle: 'agent-1' }, { id: 'kernel', name: 'Kernel', handle: 'kernel', isKernel: true }],
  })
})

describe('resolve_git_credential', () => {
  it('an unknown agent is not_found, and no token is minted', async () => {
    await expect(resolveGitCredentialOp(runCtx('proj-1', { agentId: 'nobody' }), projectRepo)).rejects.toMatchObject({ code: 'not_found' })
    expect(getTokenFor).not.toHaveBeenCalled()
  })

  it("a run is refused a repository its boundary does not own, with the reason, and no token is minted", async () => {
    const err = await resolveGitCredentialOp(runCtx('another-project'), projectRepo).catch((e) => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err).toMatchObject({ code: 'forbidden', message: "This run's boundary does not own this repository attachment." })
    expect(getTokenFor).not.toHaveBeenCalled()
  })

  it("a project's run gets the token for its own project's repository", async () => {
    expect(await resolveGitCredentialOp(runCtx('proj-1'), projectRepo)).toEqual({ username: 'x-access-token', password: 'ghs_token123' })
    expect(getTokenFor).toHaveBeenCalledWith({ owner: 'acme', name: 'widgets' })
  })

  it("a person's own chat gets the token for their own repository, and not another person's", async () => {
    const mine = { ownerType: 'user' as const, ownerId: 'u1', ...repo }
    await expect(resolveGitCredentialOp(chatCtx('u1'), mine)).resolves.toMatchObject({ password: 'ghs_token123' })
    await expect(resolveGitCredentialOp(chatCtx('u2'), mine)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('a kernel agent skips the ownership check entirely', async () => {
    getTokenFor.mockResolvedValue('ghs_kernel')
    expect(await resolveGitCredentialOp(runCtx('another-project', { agentId: 'kernel' }), projectRepo)).toEqual({ username: 'x-access-token', password: 'ghs_kernel' })
  })

  it("refuses a person's connection, which is no run (adr-0090)", async () => {
    await expect(resolveGitCredentialOp(connectionCaller(), { ...projectRepo, agentId: 'agent-1' })).rejects.toMatchObject({ code: 'forbidden' })
    expect(getTokenFor).not.toHaveBeenCalled()
  })
})
