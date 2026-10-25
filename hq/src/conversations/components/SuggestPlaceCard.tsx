import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { useAction, useQuery, addConversationPlace, getConversationPlaces } from 'wasp/client/operations'
import { RefusedAction } from '../../shared/components/RefusedAction'
import { actionErrorText } from '../hooks/threadState'
import type { PlaceSuggestion, PlaceSummary } from '../placesProtocol'
import { addNotice, placeKey, refOf } from './placesView'

export type SuggestPlaceCardData = PlaceSuggestion

const BUTTON = 'rounded-lg px-3 py-1 text-small font-medium disabled:opacity-50 max-lg:min-h-10'

/**
 * "Add a place to this conversation: Shop" with the lead's reason, Not now and Add Shop. The lead only asks: the
 * buttons are shown to the conversation's person alone, and Add does what Add place… does.
 */
export function SuggestPlaceCard({ place, why, agentName, canAnswer, answered = false, busy = false, error, onAdd, onDismiss }: {
  place: PlaceSummary
  why: string
  agentName: string
  canAnswer: boolean
  /** The place is already in the conversation: the card is answered and has no buttons. */
  answered?: boolean
  busy?: boolean
  error?: string | null
  onAdd: () => void
  onDismiss: () => void
}) {
  return (
    <div className="bg-warning/5 px-3 py-2" data-testid="suggest-place-card">
      <div className="flex items-start gap-2">
        <MapPin size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-small">
          <p className="break-words font-semibold text-text-primary">Add a place to this conversation: {place.name}</p>
          {why && <p className="break-words text-micro text-text-secondary" data-testid="suggest-place-why">{why}</p>}
          <p className="text-micro text-text-muted">{addNotice(agentName, place.name)}</p>
          {answered ? (
            <p className="mt-1 text-micro text-text-muted" data-testid="suggest-place-added">Added to this conversation</p>
          ) : canAnswer ? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={onDismiss} className={`${BUTTON} border border-border bg-surface-1 text-text-primary hover:bg-surface-hover`}>Not now</button>
              <button type="button" disabled={busy} onClick={onAdd} className={`${BUTTON} bg-accent text-on-accent hover:bg-accent-hover`}>Add {place.name}</button>
            </div>
          ) : (
            <p className="mt-1 text-micro text-text-muted">Waiting for the person in this conversation to answer</p>
          )}
          <RefusedAction reason={error} />
        </div>
      </div>
    </div>
  )
}

/** The card wired to the conversation: Add calls `addConversationPlace`; Not now hides it on this screen. */
export function SuggestPlaceCardRow({ conversationId, card, agentName, canAnswer }: {
  conversationId: string
  card: SuggestPlaceCardData
  agentName: string
  canAnswer: boolean
}) {
  const add = useAction(addConversationPlace)
  const { data: places } = useQuery(getConversationPlaces, { conversationId })
  const answered = !!places && [places.own, ...places.added].some((p) => placeKey(p) === placeKey(card.place))
  const [state, setState] = useState<{ busy: boolean; error: string; hidden: boolean }>({ busy: false, error: '', hidden: false })
  if (state.hidden && !answered) return null
  const onAdd = async () => {
    setState({ busy: true, error: '', hidden: false })
    try {
      await add({ conversationId, place: refOf(card.place) })
      setState({ busy: false, error: '', hidden: false })
    } catch (err) {
      setState({ busy: false, error: actionErrorText(err, 'Could not add the place'), hidden: false })
    }
  }
  return (
    <SuggestPlaceCard
      place={card.place}
      why={card.why}
      agentName={agentName}
      canAnswer={canAnswer}
      answered={answered}
      busy={state.busy}
      error={state.error}
      onAdd={() => void onAdd()}
      onDismiss={() => setState((s) => ({ ...s, hidden: true }))}
    />
  )
}
