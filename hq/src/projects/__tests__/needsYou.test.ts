/** The server's "needs you" is the Tasks tool's: the same answer for every combination of the fields it reads. */
import { describe, it, expect } from 'vitest'
import { needsPerson } from '@agenthix/ui/tasks'
import { waitsForAgent } from '../pages/toolTaskRows'
import { needsYou } from '../needsYou'
import { NO_AGENT_REASON } from '../../agents/taskExecutionReasons'

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']
const RUN_STATES = ['RUN_NONE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED']
const REASONS = [null, NO_AGENT_REASON, 'something else']
const AGENTS = [null, 'agent-1']

describe('needsYou agrees with the Tasks tool', () => {
  for (const status of STATUSES) for (const runState of RUN_STATES) for (const runStateReason of REASONS) for (const assignedAgentId of AGENTS) {
    it(`${status} ${runState} ${runStateReason ?? '-'} ${assignedAgentId ?? 'no agent'}`, () => {
      const row = { status, runState, runStateReason, assignedAgentId }
      expect(needsYou(row)).toBe(needsPerson({ status, runState, waitsForAgent: waitsForAgent(row) }))
    })
  }
})
