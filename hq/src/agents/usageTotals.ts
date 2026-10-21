/**
 * An agent's usage as the Agents design shows it (every screen reviewed spec
 * §3): a person's (the runs on their behalf), a project's (every run in it) and
 * the organisation's (every run). One run counts for all three.
 *
 * Pure: the rows come from `run.usage` grouped by session
 * (`sessions/runUsageRead.ts`), and each session is resolved from hq's own
 * records, because only hq knows a task's person and current project.
 *
 * The run rows carry tokens and the model, nothing else. Cost is estimated from
 * the tokens at the model's list price (`calculateCost`), and tokens of a model
 * with no price are counted in `unpricedTokens` rather than as free. Energy is
 * the same per-token estimate the rest of hq shows (`tokensToKwh`).
 */
import type { RunUsageRow } from '@agenthix/core'
import { calculateCost, tokensToKwh, MODEL_PRICING } from '../shared/utils/aiMetrics'

export type UsageSession = {
  userId: string
  sessionType: string
  primaryOwnerType: string | null
  primaryOwnerId: string | null
  task: { projectId: string; onBehalfOfUserId: string } | null
}

export type UsageTotals = {
  runCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  /** Estimated, in US dollars, at list price; the tokens below are not in it. */
  costUsd: number
  unpricedTokens: number
  energyKwh: number
}

export function emptyTotals(): UsageTotals {
  return { runCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: 0, unpricedTokens: 0, energyKwh: 0 }
}

/** Adds one set of totals into another, as when several projects are shown as one line. */
export function addTotals(into: UsageTotals, from: UsageTotals): void {
  for (const k of Object.keys(into) as (keyof UsageTotals)[]) into[k] += from[k]
}

function add(t: UsageTotals, row: RunUsageRow): void {
  t.runCount += row.runCount
  t.inputTokens += row.inputTokens
  t.outputTokens += row.outputTokens
  t.cacheReadTokens += row.cacheReadTokens
  t.cacheWriteTokens += row.cacheWriteTokens
  t.totalTokens += row.totalTokens
  if (row.model && MODEL_PRICING[row.model]) t.costUsd += calculateCost(row, row.model)
  else t.unpricedTokens += row.totalTokens
  t.energyKwh += tokensToKwh(row.totalTokens)
}

/**
 * The person a run is on behalf of: the one its dispatch named (a person
 * started it), else a chat's person, else its task's person (adr-0089, adr-0095).
 */
export function runPerson(row: RunUsageRow, session: UsageSession | undefined): string | null {
  if (row.onBehalfOfUserId) return row.onBehalfOfUserId
  if (!session) return null
  if (session.sessionType === 'chat') return session.userId
  return session.task?.onBehalfOfUserId ?? null
}

/** The project a run is in: its task's, or the project a conversation is placed in; null for a person's own space. */
export function runProject(session: UsageSession | undefined): string | null {
  if (!session) return null
  if (session.task) return session.task.projectId
  return session.primaryOwnerType === 'project' ? session.primaryOwnerId : null
}

export type UsageBreakdown = {
  organisation: UsageTotals
  /** Null when no person was asked for. */
  person: UsageTotals | null
  /** Null when no project was asked for. */
  project: UsageTotals | null
  /** Every project's share, keyed by project id; personal projects are in `ownSpaces` instead. */
  byProject: Map<string, UsageTotals>
  /** Runs in people's own spaces, together — never one person's named. */
  ownSpaces: UsageTotals
}

export function usageTotals(
  rows: RunUsageRow[],
  sessions: ReadonlyMap<string, UsageSession>,
  opts: { personId?: string; projectId?: string; personalProjectIds: ReadonlySet<string> },
): UsageBreakdown {
  const out: UsageBreakdown = {
    organisation: emptyTotals(),
    person: opts.personId ? emptyTotals() : null,
    project: opts.projectId ? emptyTotals() : null,
    byProject: new Map(),
    ownSpaces: emptyTotals(),
  }
  for (const row of rows) {
    const session = row.sessionId ? sessions.get(row.sessionId) : undefined
    add(out.organisation, row)
    if (out.person && runPerson(row, session) === opts.personId) add(out.person, row)
    const projectId = runProject(session)
    if (out.project && projectId === opts.projectId) add(out.project, row)
    if (projectId === null || opts.personalProjectIds.has(projectId)) {
      add(out.ownSpaces, row)
    } else {
      let share = out.byProject.get(projectId)
      if (!share) out.byProject.set(projectId, (share = emptyTotals()))
      add(share, row)
    }
  }
  return out
}
