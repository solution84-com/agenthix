/**
 * The organisation's limits on what agents may start (adr-0175, adr-0091). Work
 * starts only by an explicit act, so the only values left are how deep a chain
 * of work agents start for each other may go, and whether projects may let
 * their agents set start times when a person asks.
 */

/** The product's floor on a repeat rule. */
export const AUTOMATION_INTERVAL_FLOOR_MINUTES = 5
const MAX_DEPTH_CEILING = 20

export type OrgAutomation = {
  agentSchedules: boolean
  maxDepth: number
}

export const ORG_AUTOMATION_DEFAULTS: OrgAutomation = {
  agentSchedules: false,
  maxDepth: 3,
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

/** Why an org's values cannot be saved, or null when they can. */
export function orgAutomationProblem(v: OrgAutomation): string | null {
  if (typeof v.agentSchedules !== 'boolean') return 'The switch must be on or off'
  if (!isInt(v.maxDepth) || v.maxDepth < 0 || v.maxDepth > MAX_DEPTH_CEILING) {
    return `The maximum depth must be a whole number from 0 to ${MAX_DEPTH_CEILING}`
  }
  return null
}

/** Reads an Org row's values; a missing org is the defaults. */
export function orgAutomationFromRow(row: { automationAgentSchedules: boolean; automationMaxDepth: number } | null): OrgAutomation {
  if (!row) return { ...ORG_AUTOMATION_DEFAULTS }
  return { agentSchedules: row.automationAgentSchedules, maxDepth: row.automationMaxDepth }
}

/** Whether agents in a project may set start times: only where the organisation and the project both allow it. */
export function agentsMaySchedule(org: OrgAutomation, project: { agentSchedules: boolean } | null): boolean {
  return org.agentSchedules && !!project?.agentSchedules
}
