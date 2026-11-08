import { useCallback, useMemo } from 'react'
import { useAuth } from 'wasp/client/auth'
import { useQuery, getRoutineRunFacts } from 'wasp/client/operations'
import { useUsername } from '../../shared/useUsername'
import type { RoutineRunFactsArgs, RoutineRunFactsResult } from './routineRunFactsRules'
import type { Me } from './routineWords'

/** How often a list of routines reads again, so a run's start and end show while it is open. */
export const ROUTINES_REFRESH_MS = 15_000

/** The signed-in person, as the routine words name them. */
export function useMe(): Me {
  const { data: user } = useAuth()
  const name = useUsername()
  return useMemo(() => ({ id: user?.id ?? '', name }), [user?.id, name])
}

/** The routines' costs, today's runs and their instructions in a line, beside hq's own records of them. */
/** `todayFrom`: the viewer's midnight as an ISO instant (`useWorkroomClock`'s). */
export function useRoutineFacts(args: Omit<RoutineRunFactsArgs, 'todayFrom'> | null, todayFrom: string) {
  const { data } = useQuery(
    getRoutineRunFacts,
    args ? { ...args, todayFrom } : undefined,
    { enabled: !!args, refetchInterval: ROUTINES_REFRESH_MS },
  )
  const facts = data as RoutineRunFactsResult | undefined
  const cost = useCallback((routineRunId: string) => facts?.cost[routineRunId], [facts])
  return { facts, cost, about: (routineId: string) => facts?.about[routineId] ?? null }
}
