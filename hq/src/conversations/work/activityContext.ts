/**
 * A worker's context use on its activity row (long conversations spec, Workers and tasks: the platform shows
 * context use). The figure is the runtime's own, read from the site when the sheet is fetched: the run's, as it
 * left it, else the worker session's — the last run's — while the run is still going. Only for work still under
 * way; a site out of reach leaves the row without it.
 */
import { parseContextUse, type ContextUse, type RunRow, type SessionRow } from '@agenthix/core'
import { ENDED_OPERATION_STATES, type OperationKindValue, type OperationStateValue } from '../../shared/conversations/protocol'
import * as siteRuntimeStore from '../../sessions/siteRuntimeStore'

export type ContextRow = {
  id: string
  kind: OperationKindValue
  state: OperationStateValue
  siteId: string | null
  runId: string | null
  workerSessionId: string | null
}

export interface SiteReads {
  getRun(siteId: string, runId: string): Promise<Pick<RunRow, 'contextUse'> | null>
  getSession(siteId: string, sessionId: string): Promise<Pick<SessionRow, 'contextUse'> | null>
}

const siteReads: SiteReads = { getRun: siteRuntimeStore.getRun, getSession: siteRuntimeStore.getSession }

const isEnded = (state: OperationStateValue) => (ENDED_OPERATION_STATES as readonly string[]).includes(state)

/** The run's figure, else its session's: the run writes its own only when it ends. */
export function workerContextUse(run: Pick<RunRow, 'contextUse'> | null, session: Pick<SessionRow, 'contextUse'> | null): ContextUse | null {
  return parseContextUse(run?.contextUse) ?? parseContextUse(session?.contextUse)
}

async function contextUseOf(row: ContextRow, reads: SiteReads): Promise<ContextUse | null> {
  if (row.kind !== 'WORKER' || isEnded(row.state) || !row.siteId || !row.runId) return null
  const { siteId, runId, workerSessionId } = row
  try {
    const run = await reads.getRun(siteId, runId)
    const fromRun = workerContextUse(run, null)
    if (fromRun || !workerSessionId) return fromRun
    return workerContextUse(null, await reads.getSession(siteId, workerSessionId))
  } catch {
    return null
  }
}

/** Each worker row's context use, by operation id; read in parallel. */
export async function contextUseByOperation(rows: ContextRow[], reads: SiteReads = siteReads): Promise<Map<string, ContextUse>> {
  const found = await Promise.all(rows.map(async (row) => [row.id, await contextUseOf(row, reads)] as const))
  return new Map(found.filter((entry): entry is readonly [string, ContextUse] => entry[1] !== null))
}
