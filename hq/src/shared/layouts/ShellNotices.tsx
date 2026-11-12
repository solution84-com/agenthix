import { useEffect } from 'react'
import { useFrameLine, type FrameLineState } from './useFrameLine'

/**
 * The state of HQ as a whole, read once for the frame: HQ not answering, or read-only while it moves. It draws
 * nothing itself (decision 4: never a dialog): it hands the frame line's words, and whether the screens hold back their
 * own "could not be read", to the shell that draws the line. A scheduled change to a site is a notification, raised
 * by HQ (`sites/scheduled/scheduledChanges.ts`), and the fact on the project's site line (`SiteScheduleFact`).
 */
export function ShellNotices({ onChange }: { onChange: (state: FrameLineState) => void }) {
  const { words, link = null, holdReadNudges } = useFrameLine()
  const href = link?.href ?? null
  const label = link?.label ?? null
  useEffect(() => {
    onChange({ words, link: href && label ? { href, label } : null, holdReadNudges })
  }, [words, href, label, holdReadNudges, onChange])
  return null
}
