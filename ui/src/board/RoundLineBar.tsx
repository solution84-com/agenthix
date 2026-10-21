import type { BoardRoundLine } from './types'

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** The words for a throttled project's round: who is in it and how far each has got, or when the next starts. */
export function roundLineText(line: BoardRoundLine): string {
  if (!line.automationOn) {
    return line.throttled === 1
      ? 'Automation is off — 1 throttled task waits for a person'
      : `Automation is off — ${line.throttled} throttled tasks wait for a person`
  }
  if (line.open) {
    const agents = line.agents.map(a => `${a.agentName} ${a.done} of ${a.total}`).join(' · ')
    return `Round in progress — ${agents}`
  }
  if (line.throttled === 0) return 'No round open — the next starts when something is queued'
  return line.nextAt
    ? `Next round at ${clock(line.nextAt)} — ${line.throttled} throttled`
    : `Next round when one is due — ${line.throttled} throttled`
}

/** One line above the columns of a board whose project throttles its pulse (agents own schedule spec §6). */
export function RoundLineBar({ line }: { line: BoardRoundLine }) {
  return (
    <div className="px-4 py-1.5 text-small text-text-secondary border-b border-border bg-surface-1">
      {roundLineText(line)}
    </div>
  )
}
