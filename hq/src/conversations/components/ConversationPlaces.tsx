import { useState } from 'react'
import { useQuery, getConversationPlaces, addConversationPlace, removeConversationPlace } from 'wasp/client/operations'
import { RefusedAction } from '../../shared/components/RefusedAction'
import { actionErrorText } from '../hooks/threadState'
import { PlacesBar } from './PlacesBar'
import { refOf, type PlaceSummary } from './placesView'

/**
 * The conversation's places (agent knowledge, C3): its own place, the ones the person added, and Add place…. Only the
 * person whose conversation it is changes them; everyone else reads the list. A refused change says why.
 */
export function ConversationPlaces({ conversationId, agentName, canChange }: { conversationId: string; agentName: string; canChange: boolean }) {
  const { data } = useQuery(getConversationPlaces, { conversationId })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (change: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await change()
    } catch (err) {
      setError(actionErrorText(err, 'Could not change the places'))
    } finally {
      setBusy(false)
    }
  }
  if (!data) return null
  return (
    <div data-testid="conversation-places-strip" className="shrink-0 border-b border-border-subtle">
      <div className="mx-auto w-full max-w-[720px] px-4 py-1.5">
        <PlacesBar
          view={data}
          agentName={agentName}
          canChange={canChange}
          busy={busy}
          onAdd={(p: PlaceSummary) => run(() => addConversationPlace({ conversationId, place: refOf(p) }))}
          onRemove={(p: PlaceSummary) => run(() => removeConversationPlace({ conversationId, place: refOf(p) }))}
        />
        <RefusedAction reason={error} onDismiss={() => setError('')} />
      </div>
    </div>
  )
}
