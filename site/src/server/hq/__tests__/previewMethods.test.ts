import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findFirstWorkspace, findSession } = vi.hoisted(() => ({ findFirstWorkspace: vi.fn(), findSession: vi.fn() }))
vi.mock('#db', () => ({
  prisma: { workspace: { findFirst: findFirstWorkspace }, agentSession: { findUnique: findSession } },
}))
vi.mock('../../utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

import { PreviewError, decodePreviewError } from '@agenthix/core'
import { previewStart, previewStop, type PreviewMethodDeps } from '../previewMethods'

const START = {
  location: { ownerType: 'project' as const, ownerId: 'p1' },
  ownerSlug: 'acme',
  sessionId: 's1',
  command: 'npm run dev',
  port: 5173,
}

/** The code hq would read off the wire, rather than the prose beside it. */
async function codeOf(call: Promise<unknown>): Promise<string | undefined> {
  try {
    await call
    return undefined
  } catch (err) {
    return decodePreviewError((err as Error).message)?.code
  }
}

function makeDeps(over: Partial<PreviewMethodDeps> = {}): PreviewMethodDeps & {
  entries: Map<string, { container: string; port: number; sessionId: string }>
  marks: string[]
} {
  const entries = new Map<string, { container: string; port: number; sessionId: string }>()
  const marks: string[] = []
  return {
    entries,
    marks,
    registry: {
      register: ({ previewId, container, port, sessionId }) => {
        const entry = { container, port, sessionId, startedAt: Date.now() }
        entries.set(previewId, entry)
        return entry
      },
      get: (id) => {
        const e = entries.get(id)
        return e ? { ...e, startedAt: 0 } : undefined
      },
      remove: (id) => entries.delete(id),
    },
    markPreviewStart: (c) => { marks.push(`+${c}`) },
    markPreviewEnd: (c) => { marks.push(`-${c}`) },
    startProcess: (async (_input: unknown, d: any) => {
      await d?.onContainerResolved?.('c1')
      return { container: 'c1' }
    }) as PreviewMethodDeps['startProcess'],
    stopProcess: (async () => undefined) as PreviewMethodDeps['stopProcess'],
    ...over,
  }
}

/** Site's own copy of a session, as the runner is derived from it. */
function sessionRow(over: Record<string, unknown> = {}) {
  return {
    primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null,
    taskId: null, userId: 'u-alice', sessionType: 'chat', ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findFirstWorkspace.mockResolvedValue(null)
  findSession.mockResolvedValue(sessionRow())
})

describe('preview.start', () => {
  it('answers a malformed payload with the vocabulary\'s own code, not a validation blob', async () => {
    const deps = makeDeps()
    expect(await codeOf(previewStart({ location: START.location }, deps))).toBe('invalid')
    expect(await codeOf(previewStart({ ...START, port: 'http' }, deps))).toBe('invalid')
    expect(await codeOf(previewStart(null, deps))).toBe('invalid')
  })

  it('holds the container before anything starts in it, and keeps the hold on success', async () => {
    const deps = makeDeps()
    const { previewId } = await previewStart(START, deps)

    expect(previewId).toBeTruthy()
    // Held, then waited — the order matters: the hold is what keeps either
    // sweep off the container for the length of the wait.
    expect(deps.marks).toEqual(['+c1'])
    expect(deps.entries.get(previewId)).toMatchObject({ container: 'c1', port: 5173, sessionId: 's1' })
  })

  it('releases the hold when the dev server never becomes ready', async () => {
    const deps = makeDeps({
      startProcess: (async (_i: unknown, d: any) => {
        await d?.onContainerResolved?.('c1')
        throw new PreviewError('not_ready', 'the port never opened')
      }) as PreviewMethodDeps['startProcess'],
    })

    expect(await codeOf(previewStart(START, deps))).toBe('not_ready')
    // Held for the wait, released on the failure — the container is not
    // pinned open by a preview that never started.
    expect(deps.marks).toEqual(['+c1', '-c1'])
  })

  it('holds nothing when the boundary has no container at all', async () => {
    const deps = makeDeps({
      startProcess: (async () => { throw new PreviewError('no_container', 'none up') }) as PreviewMethodDeps['startProcess'],
    })

    expect(await codeOf(previewStart(START, deps))).toBe('no_container')
    expect(deps.marks).toEqual([])
  })

  it('refuses a workspace that is not in that owner\'s storage', async () => {
    findFirstWorkspace.mockResolvedValue(null)
    const deps = makeDeps()

    const code = await codeOf(previewStart({ ...START, location: { ...START.location, workspaceId: 'w-other' } }, deps))

    expect(code).toBe('invalid')
    // Scoped to the owner, as the run path's lookup is — an id belonging to
    // someone else has to read as absent, or this is a way to ask about it.
    expect(findFirstWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w-other', ownerType: 'project', ownerId: 'p1' } }),
    )
  })

  it("resolves a person's own storage to its id-keyed container path, whatever hq's slug says", async () => {
    findSession.mockResolvedValue(sessionRow({ primaryOwnerType: 'user', primaryOwnerId: 'u1', userId: 'u1' }))
    const seen: string[] = []
    const deps = makeDeps({
      startProcess: (async (input: any, d: any) => {
        seen.push(input.cwd)
        await d?.onContainerResolved?.('c1')
        return { container: 'c1' }
      }) as PreviewMethodDeps['startProcess'],
    })

    await previewStart({ ...START, location: { ownerType: 'user', ownerId: 'u1' }, ownerSlug: 'Avery Chen' }, deps)

    // Container paths are ids (ADR-0074); hq's slug names nothing on the site.
    expect(seen).toEqual(['/users/u1/files'])
  })

  describe("whose container — the session's runner, never another's", () => {
    function capture() {
      const runners: unknown[] = []
      const deps = makeDeps({
        startProcess: (async (input: any, d: any) => {
          runners.push(input.runner)
          await d?.onContainerResolved?.('c1')
          return { container: 'c1' }
        }) as PreviewMethodDeps['startProcess'],
      })
      return { runners, deps }
    }

    it("a chat's preview runs in the chatting person's container in that project", async () => {
      const { runners, deps } = capture()
      await previewStart(START, deps)
      expect(findSession).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }))
      expect(runners).toEqual([{ kind: 'person', userId: 'u-alice' }])
    })

    it("a task's preview runs in the project's own container", async () => {
      findSession.mockResolvedValue(sessionRow({ sessionType: 'task', taskId: 't1' }))
      const { runners, deps } = capture()
      await previewStart({ ...START, location: { ownerType: 'project', ownerId: 'p1', taskId: 't1' } }, deps)
      expect(runners).toEqual([{ kind: 'project', projectId: 'p1' }])
    })

    it('refuses a session this site does not hold, rather than choosing a container', async () => {
      findSession.mockResolvedValue(null)
      const { runners, deps } = capture()
      expect(await codeOf(previewStart(START, deps))).toBe('invalid')
      expect(runners).toEqual([])
    })

    it('refuses a session that works in a different location', async () => {
      findSession.mockResolvedValue(sessionRow({ primaryOwnerId: 'p-other' }))
      const { runners, deps } = capture()
      expect(await codeOf(previewStart(START, deps))).toBe('invalid')
      expect(runners).toEqual([])
    })
  })
})

describe('preview.stop', () => {
  it('answers an id this site does not know with stopped:false, not a failure', async () => {
    const deps = makeDeps()
    await expect(previewStop({ previewId: 'pv-nope' }, deps)).resolves.toEqual({ stopped: false })
    expect(deps.marks).toEqual([])
  })

  it('answers a malformed payload with the vocabulary\'s own code', async () => {
    const deps = makeDeps()
    expect(await codeOf(previewStop({}, deps))).toBe('invalid')
    expect(await codeOf(previewStop({ previewId: '' }, deps))).toBe('invalid')
  })

  it('stops the process and releases the hold', async () => {
    const deps = makeDeps()
    const { previewId } = await previewStart(START, deps)
    deps.marks.length = 0

    await expect(previewStop({ previewId }, deps)).resolves.toEqual({ stopped: true })
    expect(deps.marks).toEqual(['-c1'])
  })

  it('releases the hold once however many stops arrive at the same time', async () => {
    const deps = makeDeps()
    const { previewId } = await previewStart(START, deps)
    deps.marks.length = 0

    const [a, b] = await Promise.all([previewStop({ previewId }, deps), previewStop({ previewId }, deps)])

    // Two concurrent stops both pass a mere `get`; only one can be the caller
    // that removed the entry. With two previews in one container, a second
    // release would take the count to zero and cost the survivor its hold.
    expect([a.stopped, b.stopped].filter(Boolean)).toHaveLength(1)
    expect(deps.marks).toEqual(['-c1'])
  })
})
