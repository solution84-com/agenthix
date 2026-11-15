/**
 * The `Operation` row of a lead's tool call, against the real test database: created running before the call,
 * the same row for an identical call while it runs, marked promoted when detached, and settled with its result
 * sealed — after which the same call is a new one. Also the adapter end to end on these rows: a slow call's late
 * result lands on its own row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUserWithRole, createProject } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import { operationRows } from '../operationRows'
import { createToolAdapter } from '../toolAdapter'
import { createSettleOperation } from '../../work/settle'
import { openJson, openText } from '../../sealing'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'
import type { TurnCapability } from '../../contract'

let capability: TurnCapability

beforeEach(async () => {
  const person = await createUserWithRole('MEMBER')
  const project = await createProject()
  const conversation = await prisma.conversation.create({ data: { home: 'PROJECT', projectId: project.id, openedById: person.id } })
  capability = turnCapability({ conversationId: conversation.id, home: 'PROJECT', projectId: project.id, actingUserId: person.id })
})

const admit = (key = 'k1') => operationRows.admit({ capability, toolName: 'list_tasks', idempotencyKey: key, title: 'List tasks' })

describe("a tool call's row @SC-957", () => {
  it('is created running, as a foreground tool call of the turn, its title sealed', async () => {
    const { operationId, alreadyRunning } = await admit()
    expect(alreadyRunning).toBe(false)
    const row = await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })
    expect(row).toMatchObject({
      kind: 'TOOL', mode: 'FOREGROUND', state: 'RUNNING', promoted: false, toolName: 'list_tasks',
      turnId: capability.turnId, authorisedById: capability.actingUserId, boundaryType: 'project', boundaryId: capability.projectId,
    })
    expect(row.title).not.toBe('List tasks')
    expect(openText(row.title)).toBe('List tasks')
  })

  it('is the same row for an identical call while it runs', async () => {
    const first = await admit()
    expect(await admit()).toEqual({ operationId: first.operationId, alreadyRunning: true })
    expect(await prisma.operation.count()).toBe(1)
  })

  it('records promotion without changing its state', async () => {
    const { operationId } = await admit()
    await operationRows.promote(operationId)
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).toMatchObject({ promoted: true, state: 'RUNNING' })
  })

  it('settles with its result sealed, and frees its key so the same call made later is a new one', async () => {
    const { operationId } = await admit()
    await operationRows.settle(operationId, { state: 'COMPLETED', result: { tasks: ['a'] } })
    const row = await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })
    expect(row.state).toBe('COMPLETED')
    expect(openJson(row.resultSummary!)).toEqual({ tasks: ['a'] })
    const again = await admit()
    expect(again.alreadyRunning).toBe(false)
    expect(again.operationId).not.toBe(operationId)
  })

  it('settles a failure with its reason', async () => {
    const { operationId } = await admit()
    await operationRows.settle(operationId, { state: 'FAILED', error: "The project's site is offline" })
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).toMatchObject({ state: 'FAILED', error: "The project's site is offline" })
  })
})

describe('the adapter on the real rows @SC-957', () => {
  it("lands a slow call's late result on the row it detached, starting the call once", async () => {
    let finish!: (v: unknown) => void
    const call = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const settled = new Promise<string>(resolve => {
      const mailbox = { operationSettled() {}, async operationEnded(id: string) { resolve(id) }, async approvalRequested() {} }
      const adapter = createToolAdapter({ rows: operationRows, call, ask: vi.fn(), settle: createSettleOperation(() => mailbox), logError: vi.fn() })
      void adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'proj-1' } }, {
        waitLimitMs: 10, signal: new AbortController().signal, mailbox,
      }).then(outcome => {
        expect(outcome.status).toBe('accepted')
        finish({ tasks: [] })
      })
    })
    const operationId = await settled
    const row = await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })
    expect(row).toMatchObject({ state: 'COMPLETED', promoted: true })
    expect(openJson(row.resultSummary!)).toEqual({ summary: '{"tasks":[]}' })
    expect(call).toHaveBeenCalledOnce()
    expect(await prisma.operation.count()).toBe(1)
  })
})
