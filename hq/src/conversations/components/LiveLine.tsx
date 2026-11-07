import { useEffect, useState } from 'react'
import type { ReplyStepView } from '../../shared/conversations/protocol'
import { seconds } from './ThinkingPill'

/** What the run in progress reports, for the line above the message box. */
export type LiveRun = {
  /** When the turn began on this screen's clock; null when the screen has not been told. */
  since: number | null
  steps: ReplyStepView[]
  /** Its words have begun to arrive. */
  writing: boolean
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * The line's words: what the run reports now, never a guess. The step still running says what it is doing
 * ("searching Knowledge and 2 more"); between steps, before any words, it is thinking; once words arrive and no
 * step runs, it is writing.
 */
export function liveLineWords(agentName: string, run: Pick<LiveRun, 'steps' | 'writing'>): string {
  const running = [...run.steps].reverse().find((s) => s.ms === undefined && !s.made)
  if (running) return `${agentName} is ${lowerFirst(running.label || 'Working')}`
  return `${agentName} is ${run.writing ? 'writing' : 'thinking'}`
}

/** Seconds since `since`, counted on each second; from when it was first drawn when `since` is not known. */
function useElapsed(since: number | null): number {
  const [drawnAt] = useState(() => Date.now())
  const from = since ?? drawnAt
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [from])
  return Math.max(0, now - from)
}

/**
 * The line just above the message box while the agent works: three moving dots, what it is doing in words with a
 * shimmer, and the turn's time. It sits where the eye is while waiting and stays in view however far up the
 * thread is scrolled. The composer draws it; it goes when the turn ends. The words are announced to a screen
 * reader as they change, the counting time is not.
 */
export function LiveLine({ agentName, run }: { agentName: string; run: LiveRun }) {
  const elapsed = useElapsed(run.since)
  const words = liveLineWords(agentName, run)
  return (
    <div className="flex min-w-0 items-center gap-2 px-4 pb-1.5 text-small text-text-muted" data-testid="live-line">
      <span aria-hidden className="flex shrink-0 items-center gap-0.5" data-testid="live-line-dots">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="live-line-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      <span role="status" className="live-line-words min-w-0 truncate">{words}</span>
      <span aria-hidden className="shrink-0 tabular-nums">{seconds(elapsed)}</span>
    </div>
  )
}
