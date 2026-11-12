import { useQuery, getMemory } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import type { GetMemoryArgs } from '../../../shared/memory/protocol'
import { MemoryRows } from './MemoryRows'

/** The person's own memories, newest first, as `args` asks: the rows, or what stands in for them. */
export function useMemoryItems(args: GetMemoryArgs, what = 'The memory') {
  const query = useQuery(getMemory, args)
  const read = useBackgroundRead(query, { what })
  return { items: query.data, isLoading: query.isLoading, read }
}

export function MemoryList({ args, onOpen, empty = 'Nothing is remembered here yet.' }: {
  args: GetMemoryArgs
  onOpen: (id: string) => void
  empty?: string
}) {
  const { items, isLoading, read } = useMemoryItems(args)
  return (
    <div className="space-y-2">
      {read.nudge}
      {isLoading ? (
        <p className="text-body text-text-muted">Loading…</p>
      ) : read.failedWithoutData ? null : !items?.length ? (
        <p className="text-body text-text-muted">{empty}</p>
      ) : (
        <MemoryRows items={items} onOpen={onOpen} />
      )}
    </div>
  )
}
