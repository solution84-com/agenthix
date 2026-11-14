import { useContext } from 'react'
import { Nudge, ReadNudgesHeld } from '@agenthix/ui/attention'

/** Web search's line when the key read did not come back: said in the line, never drawn as "needs a search key". */
export function KeyUnread({ retry }: { retry: () => void }) {
  const held = useContext(ReadNudgesHeld)
  if (held) return null
  return <Nudge place="meta" action={{ label: 'Try again', onClick: retry }}>Whether there is a search key could not be read.</Nudge>
}
