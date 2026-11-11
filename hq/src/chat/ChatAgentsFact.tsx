import { usePlaceUrl } from '../places/usePlaceUrl'
import { FOCUS_RING } from '@agenthix/ui/primitives'

/** Chat's Agents fact: it opens the place's roster in the panel. */
export function ChatAgentsFact() {
  const { openTool } = usePlaceUrl()
  return (
    <button type="button" onClick={() => openTool('agents')} className={`max-w-full truncate rounded text-left text-link hover:underline ${FOCUS_RING}`}>
      Roster, and any agent to talk to ›
    </button>
  )
}
