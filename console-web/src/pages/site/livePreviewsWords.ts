/** The words for a site's live previews (live preview spec section 5): the setting, what they use, and whose each is. */
import { LIVE_PREVIEWS_MEMORY_HIGH_PERCENT, type FleetLivePreview, type LivePreviewLimit, type LivePreviewsCapacity } from '@agenthix/core'
import type { PillTone } from '@agenthix/ui/primitives'

export const limitWords = (limit: LivePreviewLimit): string => (limit === null ? 'No limit' : `${limit} at once`)

/** "2 hours", "90 minutes", "1 day". */
export function idleWords(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

/** Busy past the line the notices use, so the screen and the notice agree. */
export const isBusy = (c: LivePreviewsCapacity | null): boolean =>
  c !== null && c.memoryPercent !== null && c.memoryPercent > LIVE_PREVIEWS_MEMORY_HIGH_PERCENT

export function openWords(c: LivePreviewsCapacity | null, listed: number): string {
  const n = c ? c.open : listed
  const of = c?.limit != null ? ` of ${c.limit}` : ''
  return n === 0 ? 'None open' : `${n}${of} open`
}

export const memoryUseWords = (c: LivePreviewsCapacity | null, totalGb: string | null): string =>
  c?.memoryPercent == null ? 'No figures yet' : `${c.memoryPercent}% of the machine's memory${totalGb ? ` (${totalGb} GB)` : ''}`

export const processorUseWords = (c: LivePreviewsCapacity | null): string =>
  c?.cpuPercent == null ? 'No figures yet' : `${c.cpuPercent}% of the machine's processors`

export function stateWords(p: FleetLivePreview): { label: string; tone: PillTone } {
  if (p.state === 'paused') return { label: 'Paused', tone: 'warning' }
  return p.state === 'starting' ? { label: 'Starting', tone: 'neutral' } : { label: 'Running', tone: 'healthy' }
}

export const turnOffWords = (open: FleetLivePreview[]): string =>
  open.length === 0 ? 'No live preview starts on this site until you turn them on again.'
    : `Turning live previews off stops ${open.length === 1 ? 'the live preview' : `all ${open.length} live previews`} open on this site. `
      + 'Each person is told. Their branches and their work are untouched.'
