import type { ReactNode } from 'react'
import { EXECUTION_STATE_LABELS, executionStateHasRing, type ExecutionState } from '@agenthix/core'

export type RunAvatarSize = 'sm' | 'md' | 'lg'

// The ring sits a gap outside the avatar, so the wrapper keeps that gap as its margin and nothing beside it moves
// when a ring comes or goes (the designs' kit, `.av`).
const GAP: Record<RunAvatarSize, { margin: string; inset: string; corner: string }> = {
  sm: { margin: 'm-[3px]', inset: '-inset-[3px]', corner: '-right-[3px] -top-[3px]' },
  md: { margin: 'm-[3px]', inset: '-inset-[3px]', corner: '-right-[3px] -top-[3px]' },
  lg: { margin: 'm-1', inset: '-inset-1', corner: '-right-1 -top-1' },
}

const RING: Partial<Record<ExecutionState, string>> = {
  WAITING: 'border-[1.5px] border-dotted border-text-muted',
  RUNNING: 'border-2 border-accent border-b-transparent animate-run-turn motion-reduce:animate-none',
  NEEDS_YOU: 'border-2 border-warning',
  FAILED: 'border-2 border-danger',
}

// The mark at the ring's top right: a dot for Needs you, a "!" for Failed. Sizes and the 8–9 px "!" are the kit's.
const MARK_SIZE: Record<RunAvatarSize, { dot: string; bang: string }> = {
  sm: { dot: 'h-[7px] w-[7px]', bang: 'h-[11px] w-[11px] text-[8px]' },
  md: { dot: 'h-2 w-2', bang: 'h-3 w-3 text-[9px]' },
  lg: { dot: 'h-2 w-2', bang: 'h-3 w-3 text-[9px]' },
}

/** "Writer · Running · 1 min · writing the fix": who, then the state, then what it is doing. */
export function runAvatarWords(name: string, state: ExecutionState | null | undefined, detail?: string | null): string {
  return [name, state ? EXECUTION_STATE_LABELS[state] : null, detail || null].filter(Boolean).join(' · ')
}

/**
 * An avatar that shows the run (D18), for an agent or a person: the avatar is passed in, and this draws the ring from
 * `core`'s execution state. Waiting is a thin dotted ring; Running a turning ring; Needs you a full ring with a dot;
 * Failed a full ring with a "!"; Not started and Finished no ring. The shape carries the state, the colour only
 * repeats it, and the words are its tooltip and its accessible name. Every avatar that shows a run is this one.
 */
export function RunAvatar({ name, state, detail, size = 'sm', children }: {
  name: string
  state?: ExecutionState | null
  /** What it is doing, after the state: "1 min · writing the fix", "asked you something". */
  detail?: string | null
  size?: RunAvatarSize
  /** The avatar itself: `AgentAvatar`, `PersonAvatar`, or the app's signed-in version of either. */
  children: ReactNode
}) {
  const words = runAvatarWords(name, state, detail)
  const ring = state && executionStateHasRing(state) ? RING[state] : undefined
  const mark = state === 'NEEDS_YOU' ? 'dot' : state === 'FAILED' ? 'bang' : null
  return (
    <span role="img" aria-label={words} title={words} data-run={state ?? undefined} className={`relative inline-flex shrink-0 rounded-full ${GAP[size].margin}`}>
      {children}
      {ring && <span aria-hidden data-testid="run-ring" className={`pointer-events-none absolute rounded-full ${GAP[size].inset} ${ring}`} />}
      {mark && (
        <span
          aria-hidden data-testid="run-mark"
          className={`pointer-events-none absolute ${GAP[size].corner} flex items-center justify-center rounded-full font-bold leading-none text-on-accent ring-2 ring-card ${
            mark === 'dot' ? `bg-warning ${MARK_SIZE[size].dot}` : `bg-danger ${MARK_SIZE[size].bang}`}`}
        >
          {mark === 'bang' ? '!' : ''}
        </span>
      )}
    </span>
  )
}
