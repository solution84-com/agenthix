import { useEffect, useRef, useState } from 'react'

/** How long words sent are still shown when their message has not landed, at the most. */
export const LIVE_WORDS_HOLD_MS = 4_000

export type LiveWords = { text: string; since: string }

/**
 * The person's words being said, to draw as their bubble. Once sent, the words stay until the message that holds them
 * lands (`sent`, a key of the person's newest message, changes), so the bubble becomes the message in place with no gap.
 * `words` undefined means not in a call: nothing is held.
 */
export function useLiveWords(words: string | undefined, sent: string): LiveWords | null {
  const live = useRef<(LiveWords & { sent: string }) | null>(null)
  const [, expired] = useState(0)
  if (words?.trim()) live.current = { text: words, since: live.current?.since ?? new Date().toISOString(), sent }
  else if (live.current && (words === undefined || live.current.sent !== sent)) live.current = null
  const holding = !words?.trim() && live.current !== null
  useEffect(() => {
    if (!holding) return
    const t = setTimeout(() => { live.current = null; expired((n) => n + 1) }, LIVE_WORDS_HOLD_MS)
    return () => clearTimeout(t)
  }, [holding])
  return live.current && { text: live.current.text, since: live.current.since }
}

/** A key of the person's newest message: it changes when a message of theirs lands or their last one grows. */
export const sentKey = (newest: { id: string; text: string } | undefined): string => (newest ? `${newest.id}:${newest.text.length}` : '')
