import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../github/protectedBranches', () => ({ refuseProtectedBranch: vi.fn() }))
vi.mock('../../../github/githubEnvironment', () => ({ ensureProtectedEnvironment: vi.fn() }))

import { guardStarterRun, type StarterGuardDeps } from '../runGuards'

const location = { place: { type: 'project' as const, id: 'p1' }, siteId: 's1', workspaceId: 'w1', person: 'u1' }
const deps = () => ({ refuseProtectedBranch: vi.fn(async () => undefined), ensureProtectedEnvironment: vi.fn(async () => 'ready' as const) }) satisfies StarterGuardDeps

describe('what hq reads from GitHub before a starter runs', () => {
  it.each(['push', 'open-pull-request'])('%s checks its branch parameter is not protected', async (workflowName) => {
    const d = deps()
    await guardStarterRun({ workflowName, parameters: { branch: 'feature/x', base: 'main' }, location }, d)
    expect(d.refuseProtectedBranch).toHaveBeenCalledWith(location, workflowName, 'feature/x')
    expect(d.ensureProtectedEnvironment).not.toHaveBeenCalled()
  })

  it('a refusal stops the run', async () => {
    const d = deps()
    d.refuseProtectedBranch.mockRejectedValueOnce(new Error('main is a protected branch'))
    await expect(guardStarterRun({ workflowName: 'push', parameters: { branch: 'main' }, location }, d)).rejects.toThrow('protected')
  })

  it('set-github-secrets checks the environment it sets on', async () => {
    const d = deps()
    await guardStarterRun({ workflowName: 'set-github-secrets', parameters: { environment: 'production' }, location }, d)
    expect(d.ensureProtectedEnvironment).toHaveBeenCalledWith(location, 'production')
  })

  it('reads nothing for any other workflow', async () => {
    const d = deps()
    await guardStarterRun({ workflowName: 'deploy-staging', parameters: { branch: 'main' }, location }, d)
    expect(d.refuseProtectedBranch).not.toHaveBeenCalled()
    expect(d.ensureProtectedEnvironment).not.toHaveBeenCalled()
  })
})
