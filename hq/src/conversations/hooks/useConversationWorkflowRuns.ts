import { useQuery, getConversationWorkflowRuns } from 'wasp/client/operations'
import { useWorkflowRunLive } from '../../workflows/components/useWorkflowRunLive'
import type { ConversationRunCard } from '../../workflows/conversationRuns'

const BACKSTOP_MS = 10_000

/** The workflow runs this conversation started: re-read when any run changes, and on a timer while one is under way. */
export function useConversationWorkflowRuns(conversationId: string): ConversationRunCard[] {
  const { data, refetch } = useQuery(getConversationWorkflowRuns, { conversationId }, {
    // React Query 4 hands the function the query's data, not the query.
    refetchInterval: (data: ConversationRunCard[] | undefined) =>
      data?.some((r) => r.state === 'waiting' || r.state === 'running') ? BACKSTOP_MS : false,
  })
  useWorkflowRunLive(null, () => { void refetch() })
  return data ?? []
}
