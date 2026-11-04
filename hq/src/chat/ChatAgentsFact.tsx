import { usePlaceUrl } from '../places/usePlaceUrl'

/** Chat's Agents fact: it opens the place's roster in the panel. */
export function ChatAgentsFact() {
  const { openTool } = usePlaceUrl()
  return (
    <button type="button" onClick={() => openTool('agents')} className="max-w-full truncate rounded text-left text-accent hover:underline">
      Roster, and any agent to talk to ›
    </button>
  )
}
