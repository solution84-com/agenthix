import { PlaceComposer, type ComposerPlace } from '../../../places/components/PlaceComposer'

/**
 * The agent's Conversations section: the message box that starts a new conversation with it in
 * the person's own space.
 */
export function AgentConversations({ composerPlace }: { composerPlace: ComposerPlace }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1" />
      <div className="mx-auto w-full max-w-3xl"><PlaceComposer place={composerPlace} /></div>
    </div>
  )
}
