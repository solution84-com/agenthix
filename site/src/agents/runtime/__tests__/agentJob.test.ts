import { describe, it, expect, vi, beforeEach } from 'vitest'

// resolveAgentContext (plan 5d-2 task 7b severance): the agent row no longer comes
// from a db lookup (`db.Agent.findUnique`, hq's own Agent table — site has no
// delegate for it, SC-338) — it arrives pre-resolved as the dispatch context's
// `AgentConfigPayload` and is carried through unchanged. The session was the one
// real site-side read here until the container work: the engine reads it once,
// before the run is queued, because the queue key and the run's container come
// from the same fields, and hands the row down. So this function no longer reads
// anything — it pairs the two and refuses a run that has no session row.
import { resolveAgentContext, shapeAgentReply, type AgentContext } from '../agentUtils'

const agentConfig = { id: '1', name: 'Test Agent', handle: 'test-agent', role: null } as any

describe('agentJob Services', () => {
  describe('resolveAgentContext', () => {
    it('refuses a run whose session row could not be read', async () => {
      // This is the gate that keeps such a run out of a shared container: it is
      // reached before `prepareAgentContainer`, so the run fails rather than
      // executing somewhere its queue key does not describe.
      await expect(resolveAgentContext(agentConfig, { session: null })).rejects.toThrow('Session not found')
    })

    it('carries the session row it was handed through unchanged, reading nothing', async () => {
      const session = { id: '1', status: 'ACTIVE' } as any

      const context: AgentContext = await resolveAgentContext(agentConfig, { session })

      expect(context.agent).toBe(agentConfig)
      expect(context.agent.name).toBe('Test Agent')
      // The same object, not a copy or a re-read: this is what makes the queue
      // key and the container provably agree.
      expect(context.session).toBe(session)
    })
  })

  describe('shapeAgentReply', () => {
    it('suppresses replies containing NO_REPLY', () => {
      expect(shapeAgentReply('This is a test NO_REPLY')).toBeNull()
      expect(shapeAgentReply('NO_REPLY')).toBeNull()
    })

    it('returns the trimmed text if it does not contain NO_REPLY', () => {
      expect(shapeAgentReply('  Valid reply  ')).toBe('Valid reply')
    })

    it('returns null if the text is empty', () => {
      expect(shapeAgentReply('   ')).toBeNull()
      expect(shapeAgentReply('')).toBeNull()
    })
  })
})
