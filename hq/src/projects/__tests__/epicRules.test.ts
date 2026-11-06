import { describe, it, expect } from 'vitest'
import { EPIC_HAS_NO_AGENT, EPIC_NOT_RUN, refuseAgentOnEpic, refuseRunOfEpic } from '../epicRules'

describe('an epic is never run (T10)', () => {
  it('refuses a run of an epic, saying where it is planned', () => {
    expect(() => refuseRunOfEpic({ isEpic: true })).toThrow(EPIC_NOT_RUN)
    expect(EPIC_NOT_RUN).toMatch(/conversation or its comments.*Nothing was changed\.$/)
    expect(() => refuseRunOfEpic({ isEpic: false })).not.toThrow()
  })

  it('refuses an agent for an epic, and leaves clearing one alone', () => {
    expect(() => refuseAgentOnEpic({ isEpic: true }, 'a1')).toThrow(EPIC_HAS_NO_AGENT)
    expect(() => refuseAgentOnEpic({ isEpic: true }, null)).not.toThrow()
    expect(() => refuseAgentOnEpic({ isEpic: false }, 'a1')).not.toThrow()
  })
})
