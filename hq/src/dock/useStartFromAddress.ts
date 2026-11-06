import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useDock } from './DockContext'
import type { PlaceRef } from './startPlace'

/**
 * A list's address `?agent=<id>` is how a link asks for a new conversation with that agent in this place (an agent's
 * card, a closed conversation's *start a new one*; `newConversationPath`). The list has no box to preselect it in, so
 * the chat panel starts the draft with that agent and the address goes back to the plain list.
 */
export function useStartFromAddress(place: PlaceRef) {
  const dock = useDock()
  const latest = useRef({ dock, place })
  latest.current = { dock, place }
  const [params, setParams] = useSearchParams()
  const agentId = params.get('agent')
  const ready = dock !== null
  useEffect(() => {
    if (!agentId || !ready) return
    latest.current.dock?.startNew(latest.current.place, agentId)
    const next = new URLSearchParams(params)
    next.delete('agent')
    setParams(next, { replace: true })
  }, [agentId, ready]) // eslint-disable-line react-hooks/exhaustive-deps -- once for each ask; `params` is read as it is then
}
