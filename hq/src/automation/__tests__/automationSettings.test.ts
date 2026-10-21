import { describe, it, expect } from 'vitest'
import {
  effectiveAutomation, orgAutomationProblem, projectAutomationProblem, orgAutomationFromRow,
  ORG_AUTOMATION_DEFAULTS, type OrgAutomation, type ProjectAutomationChoice,
} from '../automationSettings'

const ORG: OrgAutomation = { allowed: true, intervalMinutes: 30, batchSize: 3, queueLimit: 20, agentSchedules: true, throttle: false, maxDepth: 3 }
const choice = (c: Partial<ProjectAutomationChoice> = {}): ProjectAutomationChoice => ({
  enabled: true, intervalMinutes: null, batchSize: null, queueLimit: null, agentSchedules: false, throttle: false, maxDepth: null, ...c,
})

describe('the org values out of the box', () => {
  it('allow automation, a depth of 3, a queue limit of 20, no throttle (every 30 minutes, batches of 3 when on), no agent schedules', () => {
    expect(ORG_AUTOMATION_DEFAULTS).toEqual({
      allowed: true, intervalMinutes: 30, batchSize: 3, queueLimit: 20, agentSchedules: false, throttle: false, maxDepth: 3,
    })
    expect(orgAutomationFromRow(null)).toEqual(ORG_AUTOMATION_DEFAULTS)
  })
})

describe('the effective value is the stricter of the org and the project', () => {
  it('a project that chose nothing has automation off and takes every org value', () => {
    const eff = effectiveAutomation(ORG, null)
    expect(eff).toMatchObject({ enabled: false, intervalMinutes: 30, batchSize: 3, queueLimit: 20, agentSchedules: false })
  })

  it('a stricter project choice applies: longer interval, smaller batch, lower limit', () => {
    const eff = effectiveAutomation(ORG, choice({ intervalMinutes: 60, batchSize: 1, queueLimit: 0 }))
    expect(eff).toMatchObject({ enabled: true, intervalMinutes: 60, batchSize: 1, queueLimit: 0 })
    expect(Object.values(eff.limitedByOrg).every(v => !v)).toBe(true)
  })

  it('a choice the org has since tightened past applies the org value, and says it is limited', () => {
    const tightened: OrgAutomation = { ...ORG, intervalMinutes: 90, batchSize: 2, queueLimit: 5 }
    const eff = effectiveAutomation(tightened, choice({ intervalMinutes: 60, batchSize: 3, queueLimit: 10 }))
    expect(eff).toMatchObject({ intervalMinutes: 90, batchSize: 2, queueLimit: 5 })
    expect(eff.limitedByOrg).toMatchObject({ intervalMinutes: true, batchSize: true, queueLimit: true })
  })

  it('the stored choice applies again when the org loosens — nothing was rewritten', () => {
    const c = choice({ intervalMinutes: 60 })
    expect(effectiveAutomation({ ...ORG, intervalMinutes: 90 }, c).intervalMinutes).toBe(90)
    expect(effectiveAutomation(ORG, c).intervalMinutes).toBe(60)
  })

  it('an org that turns automation off turns it off for every project, however the project chose', () => {
    const eff = effectiveAutomation({ ...ORG, allowed: false }, choice({ enabled: true }))
    expect(eff.enabled).toBe(false)
    expect(eff.limitedByOrg.enabled).toBe(true)
  })

  it('agents may set schedules only where both the org and the project allow it', () => {
    expect(effectiveAutomation(ORG, choice({ agentSchedules: true })).agentSchedules).toBe(true)
    expect(effectiveAutomation(ORG, choice({ agentSchedules: false })).agentSchedules).toBe(false)
    const eff = effectiveAutomation({ ...ORG, agentSchedules: false }, choice({ agentSchedules: true }))
    expect(eff.agentSchedules).toBe(false)
    expect(eff.limitedByOrg.agentSchedules).toBe(true)
  })

  it('never goes below the product floor of 5 minutes, whatever is stored', () => {
    expect(effectiveAutomation({ ...ORG, intervalMinutes: 1 }, choice()).intervalMinutes).toBe(5)
  })
})

describe('saving values', () => {
  it('the org interval is never below 5 minutes, and every value is a whole number in range', () => {
    expect(orgAutomationProblem(ORG)).toBeNull()
    expect(orgAutomationProblem({ ...ORG, intervalMinutes: 4 })).toMatch(/5/)
    expect(orgAutomationProblem({ ...ORG, batchSize: 0 })).not.toBeNull()
    expect(orgAutomationProblem({ ...ORG, queueLimit: -1 })).not.toBeNull()
    expect(orgAutomationProblem({ ...ORG, batchSize: 1.5 })).not.toBeNull()
    expect(orgAutomationProblem({ ...ORG, queueLimit: 0 })).toBeNull()
  })

  it('a project may only move a value in the stricter direction', () => {
    expect(projectAutomationProblem(choice({ intervalMinutes: 45, batchSize: 2, queueLimit: 0 }), ORG)).toBeNull()
    expect(projectAutomationProblem(choice({ intervalMinutes: 10 }), ORG)).toMatch(/shorter/)
    expect(projectAutomationProblem(choice({ batchSize: 4 }), ORG)).toMatch(/larger/)
    expect(projectAutomationProblem(choice({ queueLimit: 21 }), ORG)).toMatch(/higher/)
  })

  it('a project cannot turn on what the org does not allow', () => {
    expect(projectAutomationProblem(choice({ enabled: true }), { ...ORG, allowed: false })).toMatch(/turned off/)
    expect(projectAutomationProblem(choice({ enabled: false }), { ...ORG, allowed: false })).toBeNull()
    expect(projectAutomationProblem(choice({ agentSchedules: true }), { ...ORG, agentSchedules: false })).toMatch(/does not allow/)
  })
})

describe('the throttle and the maximum depth (adr-0091)', () => {
  it('the throttle is off unless the project turns it on, or the org requires it — on is stricter', () => {
    expect(effectiveAutomation(ORG, choice()).throttle).toBe(false)
    expect(effectiveAutomation(ORG, choice({ throttle: true })).throttle).toBe(true)
    const required = effectiveAutomation({ ...ORG, throttle: true }, choice({ throttle: false }))
    expect(required.throttle).toBe(true)
    expect(required.limitedByOrg.throttle).toBe(true)
  })

  it('a project switching the throttle off where the org requires it is not refused — the requirement applies at use', () => {
    expect(projectAutomationProblem(choice({ throttle: false }), { ...ORG, throttle: true })).toBeNull()
  })

  it('the maximum depth is the lower of the two, and may be 0', () => {
    expect(effectiveAutomation(ORG, choice()).maxDepth).toBe(3)
    expect(effectiveAutomation(ORG, choice({ maxDepth: 0 })).maxDepth).toBe(0)
    const tightened = effectiveAutomation({ ...ORG, maxDepth: 1 }, choice({ maxDepth: 2 }))
    expect(tightened.maxDepth).toBe(1)
    expect(tightened.limitedByOrg.maxDepth).toBe(true)
  })

  it('a project may only lower the depth, and the org keeps it a whole number in range', () => {
    expect(projectAutomationProblem(choice({ maxDepth: 4 }), ORG)).toMatch(/cannot be higher than the organisation's 3/)
    expect(projectAutomationProblem(choice({ maxDepth: -1 }), ORG)).toMatch(/at least 0/)
    expect(projectAutomationProblem(choice({ maxDepth: 2 }), ORG)).toBeNull()
    expect(orgAutomationProblem({ ...ORG, maxDepth: 0 })).toBeNull()
    expect(orgAutomationProblem({ ...ORG, maxDepth: 21 })).toMatch(/maximum depth/)
    expect(orgAutomationProblem({ ...ORG, throttle: 'yes' as never })).toMatch(/on or off/)
  })

  it('reads both from the org row', () => {
    expect(orgAutomationFromRow({
      automationAllowed: true, automationIntervalMinutes: 30, automationBatchSize: 3, automationQueueLimit: 20,
      automationAgentSchedules: false, automationThrottle: true, automationMaxDepth: 1,
    })).toMatchObject({ throttle: true, maxDepth: 1 })
  })
})
