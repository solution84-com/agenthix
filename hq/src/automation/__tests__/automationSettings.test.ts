/** The organisation's limits on what agents may start (adr-0175, adr-0091): all that is left of automation's settings. */
import { describe, it, expect } from 'vitest'
import {
  ORG_AUTOMATION_DEFAULTS, agentsMaySchedule, orgAutomationFromRow, orgAutomationProblem,
} from '../automationSettings'

describe("the organisation's values", () => {
  it('start with agents unable to set start times and a maximum depth of 3', () => {
    expect(ORG_AUTOMATION_DEFAULTS).toEqual({ agentSchedules: false, maxDepth: 3 })
  })

  it('are read off the Org row, or are the defaults with no org yet', () => {
    expect(orgAutomationFromRow({ automationAgentSchedules: true, automationMaxDepth: 5 })).toEqual({ agentSchedules: true, maxDepth: 5 })
    expect(orgAutomationFromRow(null)).toEqual(ORG_AUTOMATION_DEFAULTS)
  })

  it('refuse a switch that is not on or off, and a depth that is not a whole number from 0 to 20', () => {
    expect(orgAutomationProblem({ agentSchedules: true, maxDepth: 0 })).toBeNull()
    expect(orgAutomationProblem({ agentSchedules: true, maxDepth: 20 })).toBeNull()
    expect(orgAutomationProblem({ agentSchedules: 'yes' as never, maxDepth: 3 })).toMatch(/on or off/)
    for (const maxDepth of [-1, 21, 1.5, NaN]) expect(orgAutomationProblem({ agentSchedules: false, maxDepth })).toMatch(/maximum depth/)
  })
})

describe('whether agents may set start times', () => {
  it('only where the organisation and the project both allow it', () => {
    expect(agentsMaySchedule({ agentSchedules: true, maxDepth: 3 }, { agentSchedules: true })).toBe(true)
    expect(agentsMaySchedule({ agentSchedules: false, maxDepth: 3 }, { agentSchedules: true })).toBe(false)
    expect(agentsMaySchedule({ agentSchedules: true, maxDepth: 3 }, { agentSchedules: false })).toBe(false)
    expect(agentsMaySchedule({ agentSchedules: true, maxDepth: 3 }, null)).toBe(false)
  })
})
