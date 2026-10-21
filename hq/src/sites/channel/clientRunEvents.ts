/**
 * A site's `run.stream` frame as hq passes it to a client's room. The events a client relies on
 * (`RUN_CLIENT_SOCKET`) are built afresh from the fields hq declares for them, so a change on the site's side cannot
 * reach a client unseen: data that no longer fits is dropped here, with a warning from the caller. The frame has
 * already been checked for its name, room and owner.
 */
import type { RunStreamEvent } from '@agenthix/core'
import {
  RUN_CLIENT_SOCKET as R,
  type ManifestPendingApprovalClientEvent, type RunStreamDeltaClientEvent, type TaskSessionStartedClientEvent,
} from '../../shared/conversations/runEvents'

export type ClientRunFrame = { name: string; data: unknown }

type Fields = Record<string, unknown>
type Pending = ManifestPendingApprovalClientEvent['pendingManifest']

const isFields = (v: unknown): v is Fields => !!v && typeof v === 'object' && !Array.isArray(v)
const optionalString = (v: unknown) => v === undefined || typeof v === 'string'

/** Each request's `key` and optional `reason`, copied; null when any request is not one. */
function requests(list: unknown, key: 'name' | 'pattern'): Record<string, string>[] | null {
  if (!Array.isArray(list)) return null
  const out: Record<string, string>[] = []
  for (const item of list) {
    if (!isFields(item) || typeof item[key] !== 'string' || !optionalString(item.reason)) return null
    out.push({ [key]: item[key], ...(typeof item.reason === 'string' && { reason: item.reason }) })
  }
  return out
}

function pendingManifest(v: unknown): Pending | null {
  if (!isFields(v)) return null
  const tools = requests(v.tools, 'name')
  const bashPatterns = requests(v.bashPatterns, 'pattern')
  return tools && bashPatterns ? { tools, bashPatterns } as Pending : null
}

/** null: an event a client relies on whose data does not fit what hq declares for it. */
export function clientRunEvent(e: RunStreamEvent): ClientRunFrame | null {
  // Read as it came: hq checked the frame's envelope, not its data.
  const data: Fields = isFields(e.data) ? e.data : {}
  switch (e.name) {
    case R.streamDelta: {
      if (!e.runId || typeof data.textDelta !== 'string') return null
      return { name: e.name, data: { runId: e.runId, textDelta: data.textDelta } satisfies RunStreamDeltaClientEvent }
    }
    case R.taskSessionStarted:
      // The frame's own session, which hq checked the site owns, not one named in its data.
      return { name: e.name, data: { sessionId: e.sessionId } satisfies TaskSessionStartedClientEvent }
    case R.manifestPendingApproval: {
      const pending = pendingManifest(data.pendingManifest)
      const summary = data.summary ?? null
      if (!e.runId || !pending || (summary !== null && typeof summary !== 'string')) return null
      const event: ManifestPendingApprovalClientEvent = {
        runId: e.runId, sessionId: e.sessionId, taskId: e.taskId, summary, pendingManifest: pending,
      }
      return { name: e.name, data: event }
    }
    default:
      return { name: e.name, data: e.data }
  }
}
