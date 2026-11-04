// @vitest-environment node
/**
 * When membership ends (person-scoped execution spec §4), on the site: each of
 * the three instructions stops the runs in scope, removes the containers,
 * deletes the harness homes, closes the conversations and tells hq — and
 * leaves the member folder and our record of the conversations alone.
 *
 * Homes and the member folder are real folders under a temporary site root.
 * Sessions and runs are an in-memory stand-in for the two tables; the engine
 * and the container manager are stand-ins that keep a container busy until a
 * cancelled run has unwound, as the real ones do.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Session = {
  id: string; userId: string; sessionType: string; primaryOwnerType: string | null; primaryOwnerId: string | null
  status: string; closedReason: string | null
}
type Run = { id: string; sessionId: string; status: string }

const h = vi.hoisted(() => ({
  sessions: [] as Session[],
  runs: [] as Run[],
  transcript: [] as Array<{ sessionId: string; text: string }>,
  /** Container names (`<ownerType>:<ownerId>|<runner>`) with the runs still inside each. */
  containers: new Map<string, Set<string>>(),
  sent: [] as Array<{ event: string; data: unknown }>,
  cancelled: [] as string[],
  ended: [] as Array<{ id: string; runtimeName: string | null | undefined; afterCancel: boolean; containersLeft: number }>,
}))

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key]
    if (cond && typeof cond === 'object') {
      const c = cond as { in?: unknown[]; not?: unknown }
      if (c.in) return c.in.includes(value)
      if ('not' in c) return value !== c.not
    }
    return value === cond
  })
}

vi.mock('#db', () => ({
  prisma: {
    agentSession: {
      findMany: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, boolean> }) =>
        h.sessions.filter(s => matchesWhere(s, where)).map(s =>
          Object.fromEntries(Object.keys(select).map(k => [k, s[k as keyof Session]])),
        ),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Session> }) => {
        const rows = h.sessions.filter(s => matchesWhere(s, where))
        for (const row of rows) Object.assign(row, data)
        return { count: rows.length }
      }),
    },
    agentRun: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        h.runs.filter(r => matchesWhere(r, where)).map(r => ({ id: r.id })),
      ),
    },
  },
}))

vi.mock('../../../agents/runtime/AgentEngine', () => ({
  agentEngine: {
    // The run row turns CANCELLED at once; the run leaves its container a
    // moment later, once its process has unwound.
    cancelRun: vi.fn(async (runId: string) => {
      h.cancelled.push(runId)
      const run = h.runs.find(r => r.id === runId)
      if (run) run.status = 'CANCELLED'
      setTimeout(() => { for (const runs of h.containers.values()) runs.delete(runId) }, 5)
    }),
  },
}))

vi.mock('../../../agents/runtime/AgentContainerManager', () => ({
  agentContainerManager: {
    removeContainersFor: vi.fn(async (filter: { ownerType?: string; ownerId?: string; runner?: { kind: string; userId?: string; projectId?: string } }) => {
      const runnerOf = (r: NonNullable<typeof filter.runner>) => (r.kind === 'person' ? `person:${r.userId}` : `project:${r.projectId}`)
      const names = [...h.containers.keys()].filter(name => {
        const [owner, runner] = name.split('|')
        const [ownerType, ownerId] = owner!.split(':')
        return (filter.ownerType === undefined || ownerType === filter.ownerType)
          && (filter.ownerId === undefined || ownerId === filter.ownerId)
          && (filter.runner === undefined || runner === runnerOf(filter.runner))
      })
      const busy = names.filter(n => h.containers.get(n)!.size > 0)
      if (busy.length > 0) throw new Error(`Refusing to remove ${busy.length} container(s) with a run still active`)
      for (const n of names) h.containers.delete(n)
      return names.length
    }),
  },
}))

vi.mock('../../../agents/runtime/conversationLifecycle', () => ({
  conversationLifecycle: {
    endConversation: vi.fn(async (id: string, fallback?: { runtimeName?: string | null }) => {
      h.ended.push({ id, runtimeName: fallback?.runtimeName, afterCancel: h.cancelled.length > 0, containersLeft: h.containers.size })
    }),
  },
}))

vi.mock('../../hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn((event: string, data: unknown) => { h.sent.push({ event, data }) }) },
}))

import {
  handleMemberLeftProject,
  handlePersonLeftOrganisation,
  handleProjectDeleted,
} from '../membershipEnding'

let root: string
const home = (...parts: string[]) => path.join(root, 'homes', ...parts)
const exists = (p: string) => fs.stat(p).then(() => true, () => false)

async function mkdirWithFile(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'state.jsonl'), 'private')
}

function session(id: string, userId: string, owner: [string, string] | null, sessionType = 'chat'): Session {
  const s: Session = {
    id, userId, sessionType,
    primaryOwnerType: owner?.[0] ?? null, primaryOwnerId: owner?.[1] ?? null,
    status: 'ACTIVE', closedReason: null,
  }
  h.sessions.push(s)
  h.transcript.push({ sessionId: id, text: `what ${userId} said in ${id}` })
  return s
}

function container(name: string, ...runIds: string[]): void {
  h.containers.set(name, new Set(runIds))
}

const closedPatches = () =>
  h.sent.filter(s => s.event === 'session.patch').map(s => s.data as { sessionId: string; sessionPatch: { closedReason: string } })

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'membership-ending-'))
  vi.stubEnv('SITE_ROOT', root)
  h.sessions.length = 0
  h.runs.length = 0
  h.transcript.length = 0
  h.containers.clear()
  h.sent.length = 0
  h.cancelled.length = 0
  h.ended.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => undefined)

  // Alice and Bob in project p1; Alice also in p2 and in her own storage; the project's own home.
  await mkdirWithFile(home('users', 'alice', 'p1'))
  await mkdirWithFile(home('users', 'alice', 'p2'))
  await mkdirWithFile(home('users', 'alice', 'personal'))
  await mkdirWithFile(home('users', 'bob', 'p1'))
  await mkdirWithFile(home('projects', 'p1'))
  await mkdirWithFile(path.join(root, 'projects', 'p1', 'members', 'alice'))
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await fs.rm(root, { recursive: true, force: true })
})

describe('membership.memberLeftProject', () => {
  it("stops the person's runs there, removes their container and home, closes their chats, tells hq, and acknowledges", async () => {
    session('a1', 'alice', ['project', 'p1'])
    session('a2', 'alice', ['project', 'p2'])
    session('b1', 'bob', ['project', 'p1'])
    const task = session('t1', 'alice', ['project', 'p1'], 'task')
    h.runs.push({ id: 'run-a1', sessionId: 'a1', status: 'RUNNING' }, { id: 'run-b1', sessionId: 'b1', status: 'RUNNING' })
    container('project:p1|person:alice', 'run-a1')
    container('project:p1|person:bob', 'run-b1')
    container('project:p1|project:p1')
    container('project:p2|person:alice')

    const ack = await handleMemberLeftProject({ instructionId: 'i1', userId: 'alice', projectId: 'p1' })

    expect(ack).toEqual({ instructionId: 'i1', acknowledged: true })
    expect(h.cancelled).toEqual(['run-a1'])
    expect([...h.containers.keys()].sort()).toEqual(['project:p1|person:bob', 'project:p1|project:p1', 'project:p2|person:alice'])
    expect(await exists(home('users', 'alice', 'p1'))).toBe(false)
    expect(await exists(home('users', 'alice', 'p2'))).toBe(true)
    expect(await exists(home('users', 'bob', 'p1'))).toBe(true)
    expect(await exists(home('projects', 'p1'))).toBe(true)
    expect(h.sessions.find(s => s.id === 'a1')).toMatchObject({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
    expect(h.sessions.filter(s => s.id !== 'a1').every(s => s.status === 'ACTIVE')).toBe(true)
    expect(task.status).toBe('ACTIVE')
    expect(closedPatches()).toEqual([{ sessionId: 'a1', sessionPatch: { status: 'CLOSED', closedReason: 'LEFT_PROJECT' } }])
  })

  // adr-0083: the conversation's processes, harness, staging and token end with it.
  it('ends each conversation in scope, after its runs are cancelled and before its container goes', async () => {
    const a1 = session('a1', 'alice', ['project', 'p1'])
    Object.assign(a1, { runtime: 'opencode' })
    session('b1', 'bob', ['project', 'p1'])
    h.runs.push({ id: 'run-a1', sessionId: 'a1', status: 'RUNNING' })
    container('project:p1|person:alice', 'run-a1')

    await handleMemberLeftProject({ instructionId: 'i1', userId: 'alice', projectId: 'p1' })

    expect(h.ended).toEqual([{ id: 'a1', runtimeName: 'opencode', afterCancel: true, containersLeft: 1 }])
  })

  it('leaves the member folder and our record of the conversation untouched', async () => {
    session('a1', 'alice', ['project', 'p1'])
    const record = structuredClone(h.transcript)

    await handleMemberLeftProject({ instructionId: 'i1', userId: 'alice', projectId: 'p1' })

    expect(await fs.readFile(path.join(root, 'projects', 'p1', 'members', 'alice', 'state.jsonl'), 'utf8')).toBe('private')
    expect(h.transcript).toEqual(record)
    expect(h.sessions).toHaveLength(1)
  })

  it('the same instruction twice does no harm, and repeats what hq may have missed', async () => {
    session('a1', 'alice', ['project', 'p1'])
    container('project:p1|person:alice')

    await handleMemberLeftProject({ instructionId: 'i1', userId: 'alice', projectId: 'p1' })
    const again = await handleMemberLeftProject({ instructionId: 'i1', userId: 'alice', projectId: 'p1' })

    expect(again).toEqual({ instructionId: 'i1', acknowledged: true })
    expect(h.sessions[0]).toMatchObject({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
    expect(closedPatches()).toHaveLength(2)
  })

  it('a conversation already closed keeps the reason it closed for', async () => {
    const s = session('a1', 'alice', ['project', 'p1'])
    Object.assign(s, { status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING' })

    await handleMemberLeftProject({ instructionId: 'i1', userId: 'alice', projectId: 'p1' })

    expect(s.closedReason).toBe('HARNESS_STATE_MISSING')
  })

  it('acknowledges a person with nothing here at all', async () => {
    await expect(handleMemberLeftProject({ instructionId: 'i1', userId: 'carol', projectId: 'p9' }))
      .resolves.toEqual({ instructionId: 'i1', acknowledged: true })
  })

  it('refuses params it does not accept, including an id that could name another folder', async () => {
    await expect(handleMemberLeftProject({ instructionId: 'i1', userId: 'alice' })).rejects.toThrow(/parameters/)
    await expect(handleMemberLeftProject({ instructionId: 'i1', userId: '..', projectId: 'p1' })).rejects.toThrow(/unsafe/)
    expect(await exists(home('users', 'alice', 'p1'))).toBe(true)
  })

  it('fails — and so is sent again — when a run will not leave its container', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] })
    try {
      session('a1', 'alice', ['project', 'p1'])
      container('project:p1|person:alice', 'stuck-run') // not a run of the session: nothing cancels it

      const pending = handleMemberLeftProject({ instructionId: 'i1', userId: 'alice', projectId: 'p1' })
      const outcome = expect(pending).rejects.toThrow(/run still active/)
      await vi.advanceTimersByTimeAsync(61_000)
      await outcome

      // The home stays until the container is gone; the replay finishes the job.
      expect(await exists(home('users', 'alice', 'p1'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('membership.personLeftOrganisation', () => {
  it('does it for every project and their own storage, and removes their whole home tree', async () => {
    session('a1', 'alice', ['project', 'p1'])
    session('a2', 'alice', ['project', 'p2'])
    session('a3', 'alice', ['user', 'alice'])
    session('b1', 'bob', ['project', 'p1'])
    h.runs.push({ id: 'run-a2', sessionId: 'a2', status: 'PENDING' })
    container('project:p1|person:alice')
    container('project:p2|person:alice', 'run-a2')
    container('user:alice|person:alice')
    container('project:p1|person:bob')

    const ack = await handlePersonLeftOrganisation({ instructionId: 'i2', userId: 'alice' })

    expect(ack).toEqual({ instructionId: 'i2', acknowledged: true })
    expect(h.cancelled).toEqual(['run-a2'])
    expect([...h.containers.keys()]).toEqual(['project:p1|person:bob'])
    expect(await exists(home('users', 'alice'))).toBe(false)
    expect(await exists(home('users', 'bob', 'p1'))).toBe(true)
    expect(h.sessions.filter(s => s.userId === 'alice').every(s => s.closedReason === 'LEFT_ORGANISATION')).toBe(true)
    expect(h.sessions.find(s => s.id === 'b1')!.status).toBe('ACTIVE')
    expect(closedPatches().map(p => p.sessionId).sort()).toEqual(['a1', 'a2', 'a3'])
    expect(await exists(path.join(root, 'projects', 'p1', 'members', 'alice', 'state.jsonl'))).toBe(true)
  })
})

describe('membership.projectDeleted', () => {
  it("removes every container and home of the project — its own and each member's — and closes every conversation in it", async () => {
    session('a1', 'alice', ['project', 'p1'])
    session('b1', 'bob', ['project', 'p1'])
    session('t1', 'alice', ['project', 'p1'], 'task')
    session('a2', 'alice', ['project', 'p2'])
    h.runs.push({ id: 'run-t1', sessionId: 't1', status: 'RUNNING' })
    container('project:p1|person:alice')
    container('project:p1|person:bob')
    container('project:p1|project:p1', 'run-t1')
    container('project:p2|person:alice')

    const ack = await handleProjectDeleted({ instructionId: 'i3', projectId: 'p1' })

    expect(ack).toEqual({ instructionId: 'i3', acknowledged: true })
    expect(h.cancelled).toEqual(['run-t1'])
    expect([...h.containers.keys()]).toEqual(['project:p2|person:alice'])
    expect(await exists(home('projects', 'p1'))).toBe(false)
    expect(await exists(home('users', 'alice', 'p1'))).toBe(false)
    expect(await exists(home('users', 'bob', 'p1'))).toBe(false)
    expect(await exists(home('users', 'alice', 'p2'))).toBe(true)
    expect(await exists(home('users', 'alice', 'personal'))).toBe(true)
    expect(h.sessions.filter(s => s.primaryOwnerId === 'p1').every(s => s.closedReason === 'PROJECT_DELETED')).toBe(true)
    expect(h.sessions.find(s => s.id === 'a2')!.status).toBe('ACTIVE')

    const again = await handleProjectDeleted({ instructionId: 'i3', projectId: 'p1' })
    expect(again).toEqual({ instructionId: 'i3', acknowledged: true })
  })
})

describe('run staging and links inside a home (adr-0173)', () => {
  const staging = (...parts: string[]) => path.join(root, 'run-staging', ...parts)

  it("removes the person's run staging with their home, and leaves everyone else's", async () => {
    await mkdirWithFile(staging('users', 'alice', 'p1', 'skills'))
    await mkdirWithFile(staging('users', 'alice', 'p2', 'skills'))
    await mkdirWithFile(staging('users', 'bob', 'p1', 'skills'))
    await mkdirWithFile(staging('projects', 'p1', 'skills'))

    await handleMemberLeftProject({ instructionId: 'i5', userId: 'alice', projectId: 'p1' })
    expect(await exists(staging('users', 'alice', 'p1'))).toBe(false)
    expect(await exists(staging('users', 'alice', 'p2'))).toBe(true)

    await handleProjectDeleted({ instructionId: 'i6', projectId: 'p1' })
    expect(await exists(staging('projects', 'p1'))).toBe(false)
    expect(await exists(staging('users', 'bob', 'p1'))).toBe(false)
    expect(await exists(staging('users', 'alice', 'p2'))).toBe(true)

    await handlePersonLeftOrganisation({ instructionId: 'i7', userId: 'alice' })
    expect(await exists(staging('users', 'alice'))).toBe(false)
  })

  it('never follows a symbolic link a run left in its home: what it points at stays', async () => {
    const outside = path.join(root, 'projects', 'p9', 'files')
    await mkdirWithFile(outside)
    await fs.symlink(outside, path.join(home('users', 'alice', 'p1'), 'escape'))
    await fs.symlink(path.join(outside, 'state.jsonl'), path.join(home('users', 'alice', 'p1'), 'file-escape'))

    await handleMemberLeftProject({ instructionId: 'i8', userId: 'alice', projectId: 'p1' })

    expect(await exists(home('users', 'alice', 'p1'))).toBe(false)
    expect(await fs.readFile(path.join(outside, 'state.jsonl'), 'utf8')).toBe('private')
  })
})
