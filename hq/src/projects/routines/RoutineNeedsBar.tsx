import { useNavigate } from 'react-router'
import { Button } from '@agenthix/ui/primitives'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { NeedsYouBar, NeedsYouBars } from '../../shared/components/NeedsYouBar'
import type { RoutineSummary } from '../../shared/routineTypes'
import { routineRunHref } from './routineAddresses'
import { askingRun, runName, whenWords, type Me } from './routineWords'

const ASK_WORDS: Record<string, string> = { approval: 'needs your okay', limit: 'reached its time limit' }

/**
 * A run of the routine that waits for its person, as the bar at the foot of the card (as in the Workroom), with its one
 * answer. Only the run's person can answer it, since it runs on their behalf; anyone else sees Answer greyed with why.
 */
export function RoutineNeedsBar({ routine, me, now }: { routine: Pick<RoutineSummary, 'lastRuns' | 'agent'>; me: Me; now: Date }) {
  const navigate = useNavigate()
  const run = askingRun(routine)
  if (!run) return null
  const agent = routine.agent?.name ?? 'Its agent'
  const why = ASK_WORDS[run.ask ?? ''] ?? 'needs you'
  const href = routineRunHref(run, me.id)
  const notYours = run.onBehalfOf.userId !== me.id
    ? `Only ${run.onBehalfOf.username ?? 'the person it ran for'} can answer: the run is on their behalf`
    : !href ? 'Its run has not reached a site' : undefined
  const since = run.endedAt ? ` · since ${whenWords(new Date(run.endedAt), now)}` : ''
  return (
    <NeedsYouBars>
      <NeedsYouBar
        agentName={agent}
        avatar={<AuthedAgentAvatar name={agent} size="sm" />}
        why={why}
        title={runName(run)}
        detail={`· ${why}${since}`}
        action={<Button variant="secondary" className="px-3" disabled={!!notYours} title={notYours} onClick={() => href && navigate(href)}>Answer</Button>}
      />
    </NeedsYouBars>
  )
}
