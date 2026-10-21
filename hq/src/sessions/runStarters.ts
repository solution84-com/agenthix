import { parseRunStartedBy, type RunStartedBy } from '@agenthix/core'
import { usernames } from '../projects/onBehalfOfOperations'

type Dispatch = { startedBy?: unknown; onBehalfOfUserId?: unknown }

const dispatchOf = (metadata: unknown): Dispatch =>
  (metadata as { dispatch?: Dispatch } | null)?.dispatch ?? {}
const personOf = (metadata: unknown): string | null => {
  const id = dispatchOf(metadata).onBehalfOfUserId
  return typeof id === 'string' && id ? id : null
}
const kindOf = (metadata: unknown): RunStartedBy | null => parseRunStartedBy(dispatchOf(metadata).startedBy)

const STARTER: Record<Exclude<RunStartedBy, 'person'>, string> = {
  pulse: 'started by automation',
  schedule: 'started on schedule',
  agent: 'started by an agent',
}

/**
 * What started a run, and who it is for when that is someone else — "started by you", "started by
 * automation · for Avery" — for a task session's dividers. The viewer reads as "you". The two differ
 * only when something other than a person started the run. The run's metadata stays on the site.
 */
export function starterText(kind: RunStartedBy | null, person: string | null): string | null {
  if (kind === 'person') return `started by ${person ?? 'someone'}`
  if (!kind) return person ? `for ${person}` : null
  return person ? `${STARTER[kind]} · for ${person}` : STARTER[kind]
}

export async function withRunStarters<T extends { metadata?: unknown }>(
  runs: T[],
  viewerId: string,
): Promise<Array<Omit<T, 'metadata'> & { startedBy: string | null }>> {
  const others = [...new Set(runs.map(r => personOf(r.metadata)).filter((id): id is string => !!id && id !== viewerId))]
  const names = others.length > 0 ? await usernames(others) : new Map<string, string>()
  return runs.map(({ metadata, ...run }) => {
    const id = personOf(metadata)
    const person = !id ? null : id === viewerId ? 'you' : names.get(id) ?? 'someone'
    return { ...run, startedBy: starterText(kindOf(metadata), person) }
  })
}
