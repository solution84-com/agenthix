import { useNavigate } from 'react-router'
import type { WorkTarget } from '@agenthix/core'

/** The run's page, with the conversation it belongs to so the one site that holds it is asked. */
export const runAddress = (runId: string, sessionId: string) => `/runs/${runId}?session=${sessionId}`

/** Where a conversation's links go: a run's page, the Runs screen, and a changed task in the Tasks tool. */
export function useConversationLinks(sessionId: string) {
  const navigate = useNavigate()
  return {
    onOpenRun: (runId: string) => navigate(runAddress(runId, sessionId)),
    onOpenConversationRuns: (latestRunId: string | null) => navigate(latestRunId ? runAddress(latestRunId, sessionId) : '/runs'),
    canOpenTarget: (target: WorkTarget) => target.type === 'task' && !!target.key,
    onOpenTarget: (target: WorkTarget) => {
      if (target.type !== 'task' || !target.key) return
      const next = new URLSearchParams(window.location.search)
      next.set('tool', 'tasks')
      next.set('task', target.key)
      navigate({ search: `?${next.toString()}` }, { replace: true })
    },
  }
}
