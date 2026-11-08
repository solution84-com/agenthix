import type { TimelineTaskData } from './types'

interface BarTone { bar: string; slice: string }

/** A bar's colour says its state (spec §3); tokens only. A task that needs you is outlined as well. */
export function barTone(task: Pick<TimelineTaskData, 'state' | 'runState' | 'needsYou'>): BarTone {
  if (task.state === 'DONE') return { bar: 'bg-success/20 border-success/50', slice: 'bg-success' }
  if (task.runState === 'RUN_FAILED') return { bar: 'bg-danger/20 border-danger/50', slice: 'bg-danger' }
  if (task.runState === 'RUN_BLOCKED') return { bar: 'bg-warning/20 border-warning/50', slice: 'bg-warning' }
  if (task.runState === 'RUN_ACTIVE' || task.state === 'IN_PROGRESS') return { bar: 'bg-accent/20 border-accent/50', slice: 'bg-accent' }
  return { bar: 'bg-surface-3 border-border', slice: 'bg-text-muted' }
}

export const NEEDS_YOU_OUTLINE = 'ring-2 ring-warning'
