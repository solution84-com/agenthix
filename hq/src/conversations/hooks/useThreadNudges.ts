import { createContext, useCallback, useMemo, useState } from 'react'

/**
 * A conversation's own failure, said as a line after its thread's last message (handler 9): what did not happen, why,
 * and Try again where there is a way. Not stored: gone on a reload, or once the same action works.
 */
export type ThreadNudge = {
  /** One line per cause: a second failure of the same action changes the line in place. */
  key: string
  text: string
  retry?: () => void
  /** The action's own words, in place of "Try again" (as "Start voice"). */
  actionLabel?: string
}

export type ThreadNudges = {
  nudges: ThreadNudge[]
  push: (nudge: ThreadNudge) => void
  clear: (key: string) => void
}

/** The thread's lines, held beside it for as long as it is on screen. */
export function useThreadNudges(): ThreadNudges {
  const [nudges, setNudges] = useState<ThreadNudge[]>([])
  const push = useCallback((nudge: ThreadNudge) => {
    setNudges((held) => {
      const at = held.findIndex((n) => n.key === nudge.key)
      if (at < 0) return [...held, nudge]
      const next = [...held]
      next[at] = nudge
      return next
    })
  }, [])
  const clear = useCallback((key: string) => {
    setNudges((held) => (held.some((n) => n.key === key) ? held.filter((n) => n.key !== key) : held))
  }, [])
  return useMemo(() => ({ nudges, push, clear }), [nudges, push, clear])
}

/**
 * The open thread's lines, for anything drawn inside it (a card's button, the model, the places). Null outside a
 * thread, where the same failure is the dialog (a press that failed).
 */
export const ThreadNudgesContext = createContext<Pick<ThreadNudges, 'push' | 'clear'> | null>(null)

/** "<what did not happen>: <why>", the line's words. */
export function threadLine(title: string, reason: string): string {
  return `${title}: ${reason}`
}
