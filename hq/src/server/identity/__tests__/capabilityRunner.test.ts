import { describe, it, expect, vi } from 'vitest'

// Core's boundary rule is its own (core's tests); what is checked here is whom hq names as the runner, and, with
// the real rule, that hq refuses to sign a person runner for a task anywhere but that person's own personal project.
const rule = vi.hoisted(() => ({ real: false }))
vi.mock('@agenthix/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@agenthix/core')>()
  return {
    ...core,
    runnerBoundaryMismatch: (args: Parameters<typeof core.runnerBoundaryMismatch>[0]) =>
      rule.real ? core.runnerBoundaryMismatch(args) : null,
  }
})

import { resolveRunner } from '../capabilityRunner'

const task = { id: 's1', sessionType: 'task', userId: 'u1' } as never
const chat = { id: 's2', sessionType: 'chat', userId: 'u1' } as never

describe('who a run is for', () => {
  it('is the person for anything in their own storage and for their chats', () => {
    expect(resolveRunner(task, { ownerType: 'user', ownerId: 'u1' })).toEqual({ kind: 'person', userId: 'u1' })
    expect(resolveRunner(chat, { ownerType: 'project', ownerId: 'p1' })).toEqual({ kind: 'person', userId: 'u1' })
  })

  it('is the project for a task in a project', () => {
    expect(resolveRunner(task, { ownerType: 'project', ownerId: 'p1' }, { type: 'project', id: 'p1' })).toEqual({ kind: 'project', projectId: 'p1' })
  })

  it('is the person for a task in one of their personal projects, which works in the project’s own storage', () => {
    expect(resolveRunner(task, { ownerType: 'project', ownerId: 'p9' }, { type: 'user', id: 'u1' })).toEqual({ kind: 'person', userId: 'u1' })
  })
})

describe('hq refuses to sign a person runner for a task outside their own personal project', () => {
  const withRealRule = <T>(fn: () => T): T => {
    rule.real = true
    try { return fn() } finally { rule.real = false }
  }

  it("signs it in the person's own personal project", () => {
    expect(withRealRule(() => resolveRunner(task, { ownerType: 'project', ownerId: 'p9', personalOwnerId: 'u1' }, { type: 'user', id: 'u1' })))
      .toEqual({ kind: 'person', userId: 'u1' })
  })

  it("refuses it in someone else's personal project", () => {
    expect(() => withRealRule(() => resolveRunner(task, { ownerType: 'project', ownerId: 'p9', personalOwnerId: 'u2' }, { type: 'user', id: 'u1' })))
      .toThrow('cannot be given a runner')
  })

  it('refuses it in a shared project', () => {
    expect(() => withRealRule(() => resolveRunner(task, { ownerType: 'project', ownerId: 'p1' }, { type: 'user', id: 'u1' })))
      .toThrow('cannot be given a runner')
  })
})
