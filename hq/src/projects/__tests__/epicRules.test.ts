import { describe, it, expect } from 'vitest'
import * as epicRules from '../epicRules'
import { EPIC_NOT_RUN, refuseRunOfEpic } from '../epicRules'

describe('an epic is never run (T10)', () => {
  it('refuses a run of an epic, saying where it is planned', () => {
    expect(() => refuseRunOfEpic({ type: { kind: 'EPIC' } })).toThrow(EPIC_NOT_RUN)
    expect(EPIC_NOT_RUN).toMatch(/conversation or its comments.*Nothing was changed\.$/)
    expect(() => refuseRunOfEpic({ type: { kind: 'TASK' } })).not.toThrow()
  })

  it('lets an epic have an agent that manages it (D12): no refusal of one is left', () => {
    expect(Object.keys(epicRules)).toEqual(expect.not.arrayContaining(['refuseAgentOnEpic', 'EPIC_HAS_NO_AGENT', 'AGENT_BEFORE_EPIC']))
  })
})
