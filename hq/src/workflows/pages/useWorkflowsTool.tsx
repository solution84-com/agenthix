import { useMemo } from 'react'
import { useQuery, getPlaceWorkflows } from 'wasp/client/operations'
import type { PlaceTool } from '../../places/placeTypes'
import { WorkflowsTool } from './WorkflowsTool'
import type { WorkflowPlace } from './workflowTypes'

/** How often the count beside Workflows is read again. */
export const WORKFLOWS_COUNT_REFRESH_MS = 30_000

/**
 * The Workflows entry of a place's panel (workflows spec part 5, U1): the number of workflows, or *N need you* in the
 * panel's needs tone when versions wait for approval — and only the place's administrators are told that. Undefined
 * while there is no place.
 */
export function useWorkflowsTool(place: WorkflowPlace | undefined): PlaceTool | undefined {
  const { data } = useQuery(getPlaceWorkflows, place ? { place } : undefined, { enabled: !!place, refetchInterval: WORKFLOWS_COUNT_REFRESH_MS })
  const waiting = data?.mayAdminister ? data.workflows.reduce((n, w) => n + w.waiting.length, 0) : 0
  const total = data?.workflows.length
  const type = place?.type
  const id = place?.id
  return useMemo(() => {
    if (!type || !id) return undefined
    const place: WorkflowPlace = { type, id }
    return {
      id: 'workflows',
      label: 'Workflows',
      count: waiting > 0 ? `${waiting} need you` : total === undefined ? undefined : String(total),
      tone: waiting > 0 ? 'needs' as const : undefined,
      render: () => <WorkflowsTool place={place} />,
    }
  }, [type, id, waiting, total])
}
