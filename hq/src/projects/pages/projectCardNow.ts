import type { PlaceCardState } from '@agenthix/ui/projects'
import type { ProjectCardLine } from '../projectCardQueries'
import { lastWorkedLabel } from '../../agents/pages/agentCardView'


/** What is happening in a project now (spec §3): *Needs you · 1 task · 2 running*, *Quiet · last run yesterday*. */
export function projectCardNow(line: ProjectCardLine | undefined, at: Date): { state: PlaceCardState; detail: string | null } {
  if (!line) return { state: 'quiet', detail: null }
  const running = line.runningCount > 0 ? `${line.runningCount} running` : null
  if (line.needsYouCount > 0) {
    const needs = `${line.needsYouCount} ${line.needsYouCount === 1 ? 'task' : 'tasks'}`
    return { state: 'needsYou', detail: [needs, running].filter(Boolean).join(' · ') }
  }
  if (running) return { state: 'running', detail: running }
  return { state: 'quiet', detail: line.lastRunAt ? `last run ${lastWorkedLabel(line.lastRunAt, at)}` : null }
}
