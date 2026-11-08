import { describe, expect, it } from 'vitest'
import { runDispatchParams } from '../dispatchParams'

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', role: null, runtime: 'claude-sdk', approval: 'immediate', defaultModel: 'm', allowedTools: null, allowedBashPatterns: null, isKernel: true }
const context = { agent, mounts: { ownerSlugs: {} }, riskRules: null, credential: null, chat: { sessionContext: null }, packages: {
  agent: { kind: 'agent', key: 'a', digest: 'a'.repeat(64) }, org: null, platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
} }
const session = {
  id: 's1', sessionKey: 'k1', agentId: 'a1', userId: 'u1', sessionType: 'chat', taskId: null, title: null, model: 'm',
  metadata: {}, primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null, runtime: 'claude-sdk',
  createdAt: '2026-11-07T00:00:00.000Z',
}
const dispatch = {
  kind: 'chat', startedBy: 'schedule', capabilityJwt: 'jwt', session, inputText: 'Check the links', model: 'm',
  hideUserMessage: false, context, runLimits: { timeLimitMinutes: 30, turnLimit: 50 },
}

describe("a routine's run, as dispatch carries it", () => {
  it('is a chat run with no task that names its routine', () => {
    const parsed = runDispatchParams.safeParse({ ...dispatch, routineId: 'rt-1' })
    expect(parsed.success && parsed.data.routineId).toBe('rt-1')
  })

  it("is refused on a task's run or in a task's session", () => {
    expect(runDispatchParams.safeParse({ ...dispatch, routineId: 'rt-1', kind: 'task' }).success).toBe(false)
    expect(runDispatchParams.safeParse({ ...dispatch, routineId: 'rt-1', session: { ...session, taskId: 't1' } }).success).toBe(false)
  })

  it('is absent from every other run', () => {
    const parsed = runDispatchParams.safeParse(dispatch)
    expect(parsed.success && parsed.data.routineId).toBeUndefined()
  })
})
