import { getModelList, useQuery } from 'wasp/client/operations'
import type { ModelListOwner } from '@agenthix/core'
import { ListEditor } from './ListEditor'
import { useModelListSaver } from './saveList'
import { useBackgroundRead } from '@agenthix/ui/attention'

/**
 * A project's list, or a person's own (models from one place, part 4): for the people who may change it, narrowing
 * the organisation's list and never widening it. A personal project has no list of its own: its owner's applies.
 */
export function OwnList({ owner, ownerId, intro }: { owner: Extract<ModelListOwner, 'project' | 'person'>; ownerId: string; intro: (orgName: string) => string }) {
  const query = useQuery(getModelList, { owner, ownerId })
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'The model list' })
  const save = useModelListSaver(owner)
  if (!data) return read.failedWithoutData ? <>{read.nudge}</> : <p className="text-small text-text-muted">Loading…</p>
  return (
    <>
    {read.nudge}
    <ListEditor view={data.list} reachable={data.reachable} above={data.orgName} intro={intro(data.orgName)}
      save={async d => { await save(ownerId, d); await refetch() }} />
    </>
  )
}
