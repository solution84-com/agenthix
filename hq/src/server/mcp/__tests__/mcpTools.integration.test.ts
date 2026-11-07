/**
 * hq's MCP tools as their callers see them, against the real test database:
 * each tool dispatches to the control-plane operation of the same name, a
 * result comes back as JSON text, and a refusal as plain text marked isError —
 * the role floors (@SC-299, @SC-304) and project scope (@SC-300) included.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { CapabilityClaims } from '@agenthix/core'
import { ORG_ESCAPING_TOOLS } from '../../identity/rolePolicy'
import { NO_EXECUTION_SITE_MESSAGE } from '../../../shared/noExecutionSite'
import { prisma } from '../../../test/db'
import { createProject } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
// A new project's or agent's files are seeded on a site; the site answers as one would.
vi.mock('../../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request: vi.fn(async () => ({})), isOnline: () => true }, ChannelRequestFailed }
})

import { createMcpServer } from '../mcpServer'
import { seedWorld, claims, connCtx, runCtx, setRole, setProjectRole, type World } from '../../controlplane/__tests__/controlPlaneFixtures'
import type { CallerContext } from '../../controlplane/types'

const saved = process.env.HQ_STORAGE_ROOT
let storageRoot: string
beforeAll(async () => {
  storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-tools-'))
  process.env.HQ_STORAGE_ROOT = storageRoot
})
afterAll(async () => {
  if (saved === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = saved
  await fs.rm(storageRoot, { recursive: true, force: true })
})

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean }
/** Calls a registered tool by name, as the given caller. */
async function callTool(caller: CallerContext, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  // The SDK keeps its registered tools on a field it does not type.
  const tool = (createMcpServer({ caller }) as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => Promise<ToolResult> }> })._registeredTools[name]
  if (!tool) throw new Error(`Tool '${name}' not registered`)
  return tool.handler(args)
}
const parsed = (r: ToolResult) => JSON.parse(r.content[0].text)
const run = (over: Partial<CapabilityClaims>): CallerContext => ({ kind: 'run', claims: claims(over) })
/** A chat whose session is gone: on behalf of no one (adr-0101). */
const nobodys = () => run({ role: null, sessionId: 'no-such-session' })

let w: World
let admin: () => CallerContext
beforeEach(async () => {
  w = await seedWorld()
  await prisma.userSettings.update({ where: { userId: w.member.id }, data: { role: 'ADMIN' } })
  // The member, now an org admin, through their own connection with every permission on.
  admin = () => connCtx(w.member.id, { role: 'ADMIN', connectionId: 'conn-1' })
})

describe('fetch_my_queued_tasks @SC-134', () => {
  it("returns the named agent's queued tasks the connection's person may see, with null for what a task lacks", async () => {
    await prisma.task.update({ where: { id: w.task.id }, data: { column: 'todo', description: null, labels: ['testing'] } })
    const tasks = parsed(await callTool(admin(), 'fetch_my_queued_tasks', { agentId: 'agent-1' })).tasks
    expect(tasks).toEqual([expect.objectContaining({ taskId: w.task.id, title: 'T', description: null, runState: 'RUN_QUEUED', labels: ['testing'] })])
  })

  it('returns an empty list when the agent has nothing queued', async () => {
    expect(parsed(await callTool(admin(), 'fetch_my_queued_tasks', { agentId: 'agent-1' })).tasks).toEqual([])
  })
})

describe('get_task_details', () => {
  it('returns the task document', async () => {
    const r = await callTool(admin(), 'get_task_details', { taskId: w.task.id })
    expect(r.isError).toBeFalsy()
    expect(parsed(r)).toMatchObject({ taskId: w.task.id, title: 'T', assignedAgentId: 'agent-1', runState: 'RUN_QUEUED' })
  })

  it('answers isError, in plain text, for a task that does not exist', async () => {
    const r = await callTool(admin(), 'get_task_details', { taskId: 'missing-task' })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('There is no task with the key or id "missing-task"')
  })
})

describe('the tools that are gone', () => {
  it('update_task_state is not served: an agent never sets a run state (spec §6)', () => {
    expect((createMcpServer({ caller: admin() }) as unknown as { _registeredTools: Record<string, unknown> })._registeredTools.update_task_state).toBeUndefined()
  })

  it('tick_subtask answers that it is deprecated', async () => {
    const r = await callTool(admin(), 'tick_subtask', { taskId: w.task.id, subtaskTitle: 'Write tests', done: true })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('deprecated')
  })
})

describe('update_task', () => {
  const task = () => prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })

  it('updates only what it is given', async () => {
    expect((await callTool(admin(), 'update_task', { taskId: w.task.id, title: 'New title' })).isError).toBeFalsy()
    expect(await task()).toMatchObject({ title: 'New title', priority: 'MEDIUM' })
  })

  it('updates several fields at once, priority read in any case', async () => {
    await callTool(admin(), 'update_task', { taskId: w.task.id, title: 'Updated', description: 'New description', priority: 'high' })
    expect(await task()).toMatchObject({ title: 'Updated', description: 'New description', priority: 'HIGH' })
  })

  // DEFECT, not fixed here: update_task's schema accepts `subtasks` (and the
  // server's instructions tell agents to update them), but Task has no
  // subtasks column, so the write fails in the database. The mocked test this
  // replaces never saw it.
  it.fails('replaces the whole subtask list', async () => {
    const subtasks = [{ title: 'Step A', done: false }, { title: 'Step B', done: false }]
    await callTool(admin(), 'update_task', { taskId: w.task.id, subtasks })
    // Read loosely: the column the tool assumes is the one that is missing.
    expect((await task() as unknown as { subtasks?: unknown }).subtasks).toEqual(subtasks)
  })

  it('answers isError, changing nothing, when no field is given', async () => {
    const r = await callTool(admin(), 'update_task', { taskId: w.task.id })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('At least one field must be provided')
    expect((await task()).title).toBe('T')
  })
})

// hq's own MCP endpoint answers a person's connection, and a task it creates is on behalf of that person (adr-0089).
describe('create_task', () => {
  it("is created on behalf of the connection's person, through the connection", async () => {
    const r = await callTool(admin(), 'create_task', { title: 'My task', projectId: w.project.id, orgId: 'org' })
    expect(r.isError).toBeFalsy()
    expect(await prisma.task.findUniqueOrThrow({ where: { id: parsed(r).taskId } })).toMatchObject({ onBehalfOfUserId: w.member.id, createdByConnectionId: 'conn-1' })
  })

  it('is refused, creating nothing, when its person no longer exists', async () => {
    const r = await callTool(connCtx('gone', { role: 'ADMIN' }), 'create_task', { title: 'My task', projectId: w.project.id, orgId: 'org' })
    expect(r.isError).toBe(true)
    expect(await prisma.task.count()).toBe(1)
  })
})

describe('add_comment', () => {
  it("writes the comment as the connection's person, never as an agent it names, and returns its id", async () => {
    const r = await callTool(admin(), 'add_comment', { taskId: w.task.id, agentId: 'agent-1', content: 'Work complete.' })
    expect(r.isError).toBeFalsy()
    const comment = await prisma.taskComment.findFirstOrThrow()
    expect(parsed(r)).toMatchObject({ success: true, commentId: comment.id })
    expect(comment).toMatchObject({ taskId: w.task.id, authorType: 'USER', userId: w.member.id, connectionId: 'conn-1', agentId: null, content: 'Work complete.' })
  })

  it('answers isError for a task that does not exist', async () => {
    const r = await callTool(admin(), 'add_comment', { taskId: 'missing', agentId: 'agent-1', content: 'Test' })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/no task with the key or id "missing"/)
  })
})

describe('attach_file', () => {
  it('writes the file and records the attachment, with its label when given', async () => {
    const r = await callTool(admin(), 'attach_file', { taskId: w.task.id, name: 'Application', filename: 'application.json', content: '{}', label: 'application' })
    const row = await prisma.taskAttachment.findFirstOrThrow()
    const { key } = await prisma.project.findUniqueOrThrow({ where: { id: (await prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })).projectId } })
    const { number } = await prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })
    expect(parsed(r)).toEqual({ success: true, attachmentId: row.id, fileName: 'application.json', reference: `attachments/${key}-${number}/application.json` })
    expect(row).toMatchObject({ taskId: w.task.id, fileName: 'application.json', label: 'application' })
    expect(await fs.readFile(path.join(storageRoot, 'tasks', w.task.id, row.uuid, 'application.json'), 'utf8')).toBe('{}')
  })

  it('records no label when none is given', async () => {
    await callTool(admin(), 'attach_file', { taskId: w.task.id, name: 'Notes', filename: 'notes.md', content: '# Notes' })
    expect((await prisma.taskAttachment.findFirstOrThrow()).label).toBeNull()
  })
})

describe('org-escaping MCP tools enforce role floors @SC-299', () => {
  const newAgent = { name: 'A', role: 'r', responsibilities: 'x', handle: 'agent-a' }
  const agentCreated = async () => (await prisma.agent.count({ where: { handle: 'agent-a' } })) === 1

  it('refuses create_agent for a run on behalf of no one, naming the missing authority', async () => {
    const r = await callTool(nobodys(), 'create_agent', newAgent)
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('create_agent')
    expect(r.content[0].text).toMatch(/on behalf of no one/)
    expect(await agentCreated()).toBe(false)
  })

  it("refuses create_agent for a Member's chat (floor ADMIN), whatever role its capability carries, naming the floor", async () => {
    const r = await callTool(run({ role: 'ADMIN', userId: w.outsider.id }), 'create_agent', newAgent)
    expect(r.content[0].text).toContain('ADMIN')
    expect(await agentCreated()).toBe(false)
  })

  it("lets create_agent proceed for ADMIN, and through an org admin's own connection", async () => {
    expect((await callTool(run({ role: 'ADMIN', userId: w.member.id }), 'create_agent', newAgent)).isError).toBeFalsy()
    expect((await callTool(admin(), 'create_agent', { ...newAgent, handle: 'agent-b' })).isError).toBeFalsy()
    expect(await prisma.agent.count({ where: { handle: { in: ['agent-a', 'agent-b'] } } })).toBe(2)
  })

  describe('create_project role floor @SC-304', () => {
    const projectCount = () => prisma.project.count({ where: { name: 'P' } })

    it('lets create_project proceed for ADMIN', async () => {
      expect((await callTool(run({ role: 'ADMIN', userId: w.member.id }), 'create_project', { name: 'P' })).isError).toBeFalsy()
      expect(await projectCount()).toBe(1)
    })

    it('with no Execution Site connected, reports the shared error and creates nothing', async () => {
      await prisma.executionSite.updateMany({ data: { status: 'REVOKED' } })
      const r = await callTool(run({ role: 'ADMIN', userId: w.member.id }), 'create_project', { name: 'P' })
      expect(r.isError).toBe(true)
      expect(r.content[0].text).toContain(NO_EXECUTION_SITE_MESSAGE)
      expect(await projectCount()).toBe(0)
    })

    // As in the browser, every member of the organisation may make a project.
    it('lets create_project proceed for a MEMBER', async () => {
      await setRole(w.outsider.id, 'MEMBER')
      const r = await callTool(run({ role: 'MEMBER', userId: w.outsider.id }), 'create_project', { name: 'P' })
      expect(r.isError).toBeFalsy()
      expect(await projectCount()).toBe(1)
    })
  })

  it('refuses propose_workforce_template for a Member (floor ADMIN) — the workforce tools are gated too', async () => {
    const r = await callTool(run({ role: 'MEMBER', userId: w.outsider.id }), 'propose_workforce_template', { templateId: 'wft-1', reason: 'because' })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('propose_workforce_template')
    expect(r.content[0].text).toContain('ADMIN')
  })

  // Every gate refuses with its own name, so two same-floor tools cannot swap refusals unnoticed.
  it.each(ORG_ESCAPING_TOOLS)('%s refuses a run on behalf of no one, naming itself', async (tool) => {
    const r = await callTool(nobodys(), tool, {})
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain(tool)
  })
})

describe('archive_task / delete_task are project-scoped @SC-300', () => {
  let other: { id: string }
  beforeEach(async () => {
    other = await createProject({ accessLevel: 'OPEN' })
  })
  const taskRow = () => prisma.task.findUnique({ where: { id: w.task.id } })

  it.each(['archive_task', 'delete_task'])("%s refuses a task run scoped to a different project, and a chat of the project's Viewer, naming itself", async (tool) => {
    const foreign = await callTool(runCtx(other.id), tool, { taskId: w.task.id })
    expect(foreign.isError).toBe(true)
    expect(foreign.content[0].text).toContain(tool)
    await setProjectRole(w.project.id, w.member.id, 'VIEWER')
    expect((await callTool(run({ role: 'MEMBER', userId: w.member.id }), tool, { taskId: w.task.id })).isError).toBe(true)
    expect(await taskRow()).toMatchObject({ archived: false })
  })

  it("archive_task proceeds for a task run scoped to the task's own project", async () => {
    expect((await callTool(runCtx(w.project.id), 'archive_task', { taskId: w.task.id })).isError).toBeFalsy()
    expect((await taskRow())?.archived).toBe(true)
  })

  it("delete_task proceeds for a task run scoped to the task's own project", async () => {
    expect((await callTool(runCtx(w.project.id), 'delete_task', { taskId: w.task.id })).isError).toBeFalsy()
    expect(await taskRow()).toBeNull()
  })

  // Skipped as before, not changed: a chat caller now needs membership of the
  // task's project, as someone who works there (ADR-0062, adr-0102). SC-300 says the
  // role is required, not sufficient; whether it should name membership is the QA audit's call.
  it.skip.each(['archive_task', 'delete_task'])('%s proceeds for chat claims with MEMBER role on any project', async (tool) => {
    expect((await callTool(run({ role: 'MEMBER', projectId: other.id }), tool, { taskId: w.task.id })).isError).toBeFalsy()
  })
})
