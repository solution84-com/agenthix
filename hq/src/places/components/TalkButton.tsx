import { useNavigate } from 'react-router'
import { MessageSquare } from 'lucide-react'
import type { Place } from '../placeTypes'
import { CONVERSATIONS_SECTION, sectionHref } from '../placeSections'
import { useDock } from '../../dock/DockContext'
import { canvasPlaceOf, SPACE_REF, type PlaceRef } from '../../dock/startPlace'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'

type TalkPlace = Pick<Place, 'homePath' | 'talkLabel' | 'basePath' | 'sessionLocation'> & Partial<Pick<Place, 'defaultAgentId'>>

/**
 * Where *Talk about <place>* starts its conversation in the dock: a project, or the person's own space. *Talk to
 * <agent>* on an agent's page starts one with that agent, in the person's own space, where its conversations live.
 */
function talkPlaceOf(place: TalkPlace): { ref: PlaceRef; agentId: string | null } {
  if (place.sessionLocation) return { ref: canvasPlaceOf(place.basePath), agentId: null }
  const agentId = place.basePath.startsWith('/agents/') ? place.defaultAgentId ?? null : null
  return { ref: SPACE_REF, agentId }
}

/**
 * The screen bar's *Talk about <place>* (spec §10): a new conversation about the place, in the dock. Where there is
 * no dock (no root shell), it opens the place's Conversations section. A place with no label for it shows none.
 */
export function TalkButton({ place }: { place: TalkPlace }) {
  const navigate = useNavigate()
  const dock = useDock()
  if (!place.talkLabel) return null
  return (
    <button
      type="button"
      onClick={() => {
        if (!dock) { navigate(sectionHref(place, CONVERSATIONS_SECTION)); return }
        const talk = talkPlaceOf(place)
        dock.startNew(talk.ref, talk.agentId)
      }}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-small font-medium ${BUTTON_SECONDARY}`}
    >
      <MessageSquare size={14} aria-hidden />
      {place.talkLabel}
    </button>
  )
}
