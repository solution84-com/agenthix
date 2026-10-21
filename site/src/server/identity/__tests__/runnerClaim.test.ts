import { describe, it, expect } from 'vitest'
import { requireRunnerForBoundary, RunnerClaimError } from '../runnerClaim'

const chatInProject = {
  primaryOwnerType: 'project' as const, primaryOwnerId: 'px', primaryWorkspaceId: null,
  taskId: null, userId: 'alice', sessionType: 'chat',
}
const taskInProject = { ...chatInProject, taskId: 't1', userId: 'admin-1', sessionType: 'task' }
const chatInOwnStorage = { ...chatInProject, primaryOwnerType: 'user' as const, primaryOwnerId: 'alice' }

describe('the site refuses a capability whose runner is missing or does not fit', () => {
  it('returns the runner when it fits the boundary', () => {
    expect(requireRunnerForBoundary({ userId: 'alice', runner: { kind: 'person', userId: 'alice' } }, chatInProject))
      .toEqual({ kind: 'person', userId: 'alice' })
    expect(requireRunnerForBoundary({ userId: 'admin-1', runner: { kind: 'project', projectId: 'px' } }, taskInProject))
      .toEqual({ kind: 'project', projectId: 'px' })
  })

  it('refuses a capability with no runner, or a malformed one', () => {
    for (const runner of [undefined, null, 'alice', { kind: 'person' }, { kind: 'agent', agentId: 'a1' }]) {
      expect(() => requireRunnerForBoundary({ userId: 'alice', runner }, chatInProject)).toThrow(RunnerClaimError)
    }
  })

  it("refuses a runner who is not the owner of a person's own storage", () => {
    expect(() => requireRunnerForBoundary({ userId: 'bob', runner: { kind: 'person', userId: 'bob' } },
      { ...chatInOwnStorage, userId: 'bob' })).toThrow(/owner of a person's own storage/)
  })

  it("resolves a chat with no location to its invoker's own storage, as hq does", () => {
    const personalChat = { ...chatInProject, primaryOwnerType: null, primaryOwnerId: null }
    expect(requireRunnerForBoundary({ userId: 'alice', runner: { kind: 'person', userId: 'alice' } }, personalChat))
      .toEqual({ kind: 'person', userId: 'alice' })
  })

  it('refuses a project runner for a different project', () => {
    expect(() => requireRunnerForBoundary({ userId: 'admin-1', runner: { kind: 'project', projectId: 'py' } }, taskInProject))
      .toThrow(/different project/)
  })

  it("refuses a chat run for anyone but its invoker", () => {
    expect(() => requireRunnerForBoundary({ userId: 'alice', runner: { kind: 'person', userId: 'bob' } }, chatInProject))
      .toThrow(RunnerClaimError)
    expect(() => requireRunnerForBoundary({ userId: 'alice', runner: { kind: 'project', projectId: 'px' } }, chatInProject))
      .toThrow(RunnerClaimError)
  })

  it('checks only the shape when the session row could not be read', () => {
    expect(requireRunnerForBoundary({ userId: 'alice', runner: { kind: 'person', userId: 'alice' } }, null))
      .toEqual({ kind: 'person', userId: 'alice' })
    expect(() => requireRunnerForBoundary({ userId: 'alice' }, null)).toThrow(RunnerClaimError)
  })
})
