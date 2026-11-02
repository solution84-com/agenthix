import { describe, expect, it, vi } from 'vitest'
import type { RunContext } from '../../../agents/runtime/types'
import { callersPlace, installDeps, type InstallPlaceDeps } from '../previewInstallTools'

const COPY = '0f8a4c1e-2b3d-4e5f-8a9b-0c1d2e3f4a5b'
const workspace = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }

function turn(over: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-1', sessionId: 's1', containerName: 'agent-p1', cwd: `/projects/p1/clones/${COPY}`,
    codeWork: { branch: 'add-login-page', copyId: COPY, workspace },
    ...over,
  } as RunContext
}

const deps = (): InstallPlaceDeps & { execInContainer: ReturnType<typeof vi.fn> } => ({
  runtime: null,
  execInContainer: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
})

describe('install_packages for a code-work run with no live preview (adr-0170) @SC-1743', () => {
  it('installs in the run\'s own container, in its branch\'s copy as the site recorded it', async () => {
    const d = deps()
    const place = await callersPlace({ claim: null, trustedPackageScopes: [], runId: 'run-1', context: turn() }, d)
    if (typeof place === 'string') throw new Error(place)
    expect(place.kind).toBe('copy')
    expect(place.target).toEqual({ id: `copy:${COPY}`, root: `/projects/p1/clones/${COPY}`, branchKey: 'branch:w1\u0000add-login-page' })
    if (place.kind !== 'copy') throw new Error('not a copy')
    expect(place.copy).toEqual({ workspace, copyId: COPY, branch: 'add-login-page' })
    await place.exec(place.target, ['npm', 'install'], { cwd: place.target.root, env: {}, timeoutMs: 1 })
    expect(d.execInContainer).toHaveBeenCalledWith('agent-p1', `/projects/p1/clones/${COPY}`, ['npm', 'install'], expect.anything())
  })

  it('refuses a run that works on no branch', async () => {
    const place = await callersPlace({ claim: null, trustedPackageScopes: [], runId: 'run-1', context: turn({ codeWork: undefined }) }, deps())
    expect(place).toMatch(/only by a run working on a branch/)
  })

  it('refuses when the turn running is not the calling run', async () => {
    expect(await callersPlace({ claim: null, trustedPackageScopes: [], runId: 'run-2', context: turn() }, deps())).toMatch(/Nothing was installed/)
    expect(await callersPlace({ claim: null, trustedPackageScopes: [], runId: null, context: turn() }, deps())).toMatch(/Nothing was installed/)
    expect(await callersPlace({ claim: null, trustedPackageScopes: [], runId: 'run-1', context: null }, deps())).toMatch(/Nothing was installed/)
  })

  it('refuses a run with no container: nothing is installed on the site itself', async () => {
    const place = await callersPlace({ claim: null, trustedPackageScopes: [], runId: 'run-1', context: turn({ containerName: undefined }) }, deps())
    expect(place).toMatch(/no container/)
  })
})

describe("the organisation's trusted scopes where install_packages runs (adr-0170) @SC-1743 @SC-1711", () => {
  it('reach an install in a branch\'s copy with no live preview, as the capability carried them', async () => {
    const place = await callersPlace({ claim: null, trustedPackageScopes: ['@fernhill'], runId: 'run-1', context: turn() }, deps())
    if (typeof place === 'string') throw new Error(place)
    expect(await installDeps(place, ['@fernhill']).trustedScopes()).toEqual(['@fernhill'])
    expect(await installDeps(place, []).trustedScopes()).toEqual([])
  })
})
