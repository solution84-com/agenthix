import { usePlaceUrl } from '../places/usePlaceUrl'

/** Chat's Agents fact: it opens the organisation's agents in the panel. */
export function ChatAgentsFact() {
  const { openTool } = usePlaceUrl()
  return (
    <button type="button" onClick={() => openTool('agents')} className="max-w-full truncate rounded text-left text-accent hover:underline">
      Any in the organisation ›
    </button>
  )
}
