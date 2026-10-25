/**
 * The checks hq makes before a run (workflows spec part 2, *From run to result*, step 2), as plain decisions over
 * facts `runs.ts` gathers: the workflow is on; it has a version approved in this place, whose stored content still
 * hashes as approved; every parameter matches; an agent hasn't reached its runs for the hour; every secret and
 * variable it names still exists. Each refusal says what is wrong, who can act, and that nothing was changed.
 */
import {
  AGENT_WORKFLOW_RUNS_PER_HOUR_DEFAULT, INTEGRATION_SECRET_NAMES, checkParameterValues, type WorkflowDefinition,
} from '@agenthix/core'
import type { WorkflowPlace } from './placeAccess'

export type RunCheck = { ok: true; parameters: Record<string, string> } | { ok: false; status: number; message: string }

const no = (status: number, message: string): RunCheck => ({ ok: false, status, message })

export type RunStartFacts = {
  /** The place the run is asked from: the agent's run's, or the workspace's a person chose. */
  askedFrom: WorkflowPlace
  workflow: { name: string; place: WorkflowPlace; enabled: boolean; agentRunsPerHour: number | null }
  /** The approved version, or null when none is. */
  approved: {
    number: number
    definition: WorkflowDefinition
    /** Its approval is of this workflow in this place, by its hash. */
    approvedHere: boolean
    /** Its stored files and settings still hash to what was approved. */
    contentMatches: boolean
  } | null
  parameters: Record<string, unknown>
  /** Null for a person, whose runs aren't limited. */
  agentRunsInLastHour: number | null
  secretNames: string[]
  variableNames: string[]
}

export function agentRunsPerHour(w: { agentRunsPerHour: number | null }): number {
  return w.agentRunsPerHour ?? AGENT_WORKFLOW_RUNS_PER_HOUR_DEFAULT
}

const samePlace = (a: WorkflowPlace, b: WorkflowPlace) => a.type === b.type && a.id === b.id

export function checkRunStart(f: RunStartFacts): RunCheck {
  const { workflow: w } = f
  if (!samePlace(f.askedFrom, w.place)) {
    return no(403, `${w.name} belongs to another place, and runs only there. Nothing was changed.`)
  }
  if (!w.enabled) {
    return no(409, `${w.name} is switched off, so nobody can run it; a person who administers this place can turn it on. Nothing was changed.`)
  }
  const v = f.approved
  if (!v) return no(409, `${w.name} has no approved version yet; a person who administers this place approves one first. Nothing was changed.`)
  if (!v.approvedHere || !v.contentMatches) {
    return no(409, `${w.name}'s version ${v.number} doesn't match what was approved in this place, so it won't run; a person who administers this place approves it again. Nothing was changed.`)
  }
  const params = checkParameterValues(v.definition, f.parameters)
  if (!params.ok) return no(422, `${params.errors.map((e) => e.message).join(' ')} Nothing was changed.`)
  if (f.agentRunsInLastHour !== null) {
    const limit = agentRunsPerHour(w)
    if (f.agentRunsInLastHour >= limit) {
      return no(429, `You have run ${w.name} ${f.agentRunsInLastHour} times in the last hour, its limit for an agent (${limit}); try again later, or ask a person who administers this place to raise it. Nothing was changed.`)
    }
  }
  const secrets = [...new Set(v.definition.steps.flatMap((s) => s.secrets))].filter((n) => !(INTEGRATION_SECRET_NAMES as readonly string[]).includes(n))
  const missing = secrets.filter((n) => !f.secretNames.includes(n))
  if (missing.length) {
    return no(409, `This place no longer has the secret ${missing.join(', ')} that ${w.name} uses; a person who administers this place adds it again. Nothing was changed.`)
  }
  const missingVars = v.definition.variables.filter((n) => !f.variableNames.includes(n))
  if (missingVars.length) {
    return no(409, `This place no longer has the variable ${missingVars.join(', ')} that ${w.name} uses; a person who administers this place adds it again. Nothing was changed.`)
  }
  return { ok: true, parameters: params.values }
}
