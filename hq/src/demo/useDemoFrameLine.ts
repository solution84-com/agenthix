import { useEffect, useState } from 'react'
import type { FrameLineLink } from '@agenthix/ui/attention'
import { demoFrameWords } from './countdown'
import { DEMO_GUIDE_URL, useDemo } from './useDemo'

export const DEMO_GUIDE_LINK: FrameLineLink = { href: DEMO_GUIDE_URL, label: 'About the demo' }

/** How often the countdown on the frame line is brought up to date. */
const TICK_MS = 30_000

/**
 * The frame line's demo state (live demo spec, *Reset*), its lowest: the countdown to the next reset and a link to the
 * guide's page on the demo; null outside the demo.
 */
export function useDemoFrameLine(): { words: string; link: FrameLineLink } | null {
  const demo = useDemo()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!demo.on) return
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [demo.on])
  if (!demo.on) return null
  return { words: demoFrameWords(demo.nextResetAt, Math.max(now, Date.now())), link: DEMO_GUIDE_LINK }
}
