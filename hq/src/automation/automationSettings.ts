/**
 * A boundary's automation values (adr-0087, spec §2). The org sets each value
 * once: it is where every project starts and the furthest any project may go.
 * A project's own choice is stored as it set it; the stricter of the two is
 * worked out here, at the moment it is used, and never written back — so an
 * org that tightens and later loosens a value hands each project its own
 * choice again.
 */

/** The product's floor on a pulse interval and a repeat rule. */
export const AUTOMATION_INTERVAL_FLOOR_MINUTES = 5
const INTERVAL_CEILING_MINUTES = 7 * 24 * 60
const BATCH_SIZE_CEILING = 50
const QUEUE_LIMIT_CEILING = 1000
const MAX_DEPTH_CEILING = 20

/**
 * `throttle` is whether the org requires every boundary to throttle; `maxDepth`
 * is the deepest chain of agent-queued work any boundary may allow (adr-0091).
 * The interval and batch size apply only where the throttle is on.
 */
export type OrgAutomation = {
  allowed: boolean
  intervalMinutes: number
  batchSize: number
  queueLimit: number
  agentSchedules: boolean
  throttle: boolean
  maxDepth: number
}

export const ORG_AUTOMATION_DEFAULTS: OrgAutomation = {
  allowed: true,
  intervalMinutes: 30,
  batchSize: 3,
  queueLimit: 20,
  agentSchedules: false,
  throttle: false,
  maxDepth: 3,
}

/** A project's own choices. null = take the org's value. */
export type ProjectAutomationChoice = {
  enabled: boolean
  intervalMinutes: number | null
  batchSize: number | null
  queueLimit: number | null
  agentSchedules: boolean
  throttle: boolean
  maxDepth: number | null
}

export const PROJECT_AUTOMATION_DEFAULTS: ProjectAutomationChoice = {
  enabled: false,
  intervalMinutes: null,
  batchSize: null,
  queueLimit: null,
  agentSchedules: false,
  throttle: false,
  maxDepth: null,
}

type Flags = Record<
  'enabled' | 'intervalMinutes' | 'batchSize' | 'queueLimit' | 'agentSchedules' | 'throttle' | 'maxDepth',
  boolean
>

export type EffectiveAutomation = {
  enabled: boolean
  intervalMinutes: number
  batchSize: number
  queueLimit: number
  agentSchedules: boolean
  throttle: boolean
  maxDepth: number
  /** Where the project chose something the org does not allow, so the org's value applies instead. */
  limitedByOrg: Flags
}

/** The stricter of the org's value and the project's choice, for each setting. No row is a project that chose nothing. */
export function effectiveAutomation(org: OrgAutomation, project: ProjectAutomationChoice | null): EffectiveAutomation {
  const p = project ?? PROJECT_AUTOMATION_DEFAULTS
  const orgInterval = Math.max(org.intervalMinutes, AUTOMATION_INTERVAL_FLOOR_MINUTES)
  return {
    enabled: org.allowed && p.enabled,
    intervalMinutes: Math.max(orgInterval, p.intervalMinutes ?? orgInterval),
    batchSize: Math.max(1, Math.min(org.batchSize, p.batchSize ?? org.batchSize)),
    queueLimit: Math.max(0, Math.min(org.queueLimit, p.queueLimit ?? org.queueLimit)),
    agentSchedules: org.agentSchedules && p.agentSchedules,
    throttle: org.throttle || p.throttle,
    maxDepth: Math.max(0, Math.min(org.maxDepth, p.maxDepth ?? org.maxDepth)),
    limitedByOrg: {
      enabled: p.enabled && !org.allowed,
      intervalMinutes: p.intervalMinutes !== null && p.intervalMinutes < orgInterval,
      batchSize: p.batchSize !== null && p.batchSize > org.batchSize,
      queueLimit: p.queueLimit !== null && p.queueLimit > org.queueLimit,
      agentSchedules: p.agentSchedules && !org.agentSchedules,
      throttle: !p.throttle && org.throttle,
      maxDepth: p.maxDepth !== null && p.maxDepth > org.maxDepth,
    },
  }
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

/** Why an org's automation values cannot be saved, or null when they can. */
export function orgAutomationProblem(v: OrgAutomation): string | null {
  if (typeof v.allowed !== 'boolean' || typeof v.agentSchedules !== 'boolean' || typeof v.throttle !== 'boolean') {
    return 'The switches must be on or off'
  }
  if (!isInt(v.intervalMinutes) || v.intervalMinutes < AUTOMATION_INTERVAL_FLOOR_MINUTES || v.intervalMinutes > INTERVAL_CEILING_MINUTES) {
    return `The interval must be a whole number of minutes from ${AUTOMATION_INTERVAL_FLOOR_MINUTES} to ${INTERVAL_CEILING_MINUTES}`
  }
  if (!isInt(v.batchSize) || v.batchSize < 1 || v.batchSize > BATCH_SIZE_CEILING) {
    return `The batch size must be a whole number from 1 to ${BATCH_SIZE_CEILING}`
  }
  if (!isInt(v.queueLimit) || v.queueLimit < 0 || v.queueLimit > QUEUE_LIMIT_CEILING) {
    return `The queue limit must be a whole number from 0 to ${QUEUE_LIMIT_CEILING}`
  }
  if (!isInt(v.maxDepth) || v.maxDepth < 0 || v.maxDepth > MAX_DEPTH_CEILING) {
    return `The maximum depth must be a whole number from 0 to ${MAX_DEPTH_CEILING}`
  }
  return null
}

/**
 * Why a project's choice cannot be saved under the org's current values, or
 * null when it can. A project may only move a value in the stricter direction;
 * what it saves is kept as chosen even if the org later tightens past it.
 * The throttle switched off where the org requires it is not refused: the
 * org's requirement applies at use, as for a value it has since tightened.
 */
export function projectAutomationProblem(choice: ProjectAutomationChoice, org: OrgAutomation): string | null {
  if (typeof choice.enabled !== 'boolean' || typeof choice.agentSchedules !== 'boolean' || typeof choice.throttle !== 'boolean') {
    return 'The switches must be on or off'
  }
  if (choice.enabled && !org.allowed) return 'Automation is turned off for the whole organisation'
  if (choice.agentSchedules && !org.agentSchedules) {
    return 'The organisation does not allow agents to set schedules'
  }
  const orgInterval = Math.max(org.intervalMinutes, AUTOMATION_INTERVAL_FLOOR_MINUTES)
  if (choice.intervalMinutes !== null) {
    if (!isInt(choice.intervalMinutes) || choice.intervalMinutes > INTERVAL_CEILING_MINUTES) {
      return `The interval must be a whole number of minutes up to ${INTERVAL_CEILING_MINUTES}`
    }
    if (choice.intervalMinutes < orgInterval) return `The interval cannot be shorter than the organisation's ${orgInterval} minutes`
  }
  if (choice.batchSize !== null) {
    if (!isInt(choice.batchSize) || choice.batchSize < 1) return 'The batch size must be a whole number of at least 1'
    if (choice.batchSize > org.batchSize) return `The batch size cannot be larger than the organisation's ${org.batchSize}`
  }
  if (choice.queueLimit !== null) {
    if (!isInt(choice.queueLimit) || choice.queueLimit < 0) return 'The queue limit must be a whole number of at least 0'
    if (choice.queueLimit > org.queueLimit) return `The queue limit cannot be higher than the organisation's ${org.queueLimit}`
  }
  if (choice.maxDepth !== null) {
    if (!isInt(choice.maxDepth) || choice.maxDepth < 0) return 'The maximum depth must be a whole number of at least 0'
    if (choice.maxDepth > org.maxDepth) return `The maximum depth cannot be higher than the organisation's ${org.maxDepth}`
  }
  return null
}

/** Reads an Org row's automation columns; a missing org is the defaults. */
export function orgAutomationFromRow(row: {
  automationAllowed: boolean
  automationIntervalMinutes: number
  automationBatchSize: number
  automationQueueLimit: number
  automationAgentSchedules: boolean
  automationThrottle: boolean
  automationMaxDepth: number
} | null): OrgAutomation {
  if (!row) return { ...ORG_AUTOMATION_DEFAULTS }
  return {
    allowed: row.automationAllowed,
    intervalMinutes: row.automationIntervalMinutes,
    batchSize: row.automationBatchSize,
    queueLimit: row.automationQueueLimit,
    agentSchedules: row.automationAgentSchedules,
    throttle: row.automationThrottle,
    maxDepth: row.automationMaxDepth,
  }
}
