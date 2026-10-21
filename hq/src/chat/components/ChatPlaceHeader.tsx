import { PlaceAvatar } from '@agenthix/ui/primitives'

const DESCRIPTION = 'Your personal space — private to you'

/** The top of Chat's conversations list (spec §7): the person's avatar, "Chat", and whose it is. */
export function ChatPlaceHeader({ userId, username }: { userId: string; username: string }) {
  return (
    <div className="flex items-start gap-3" data-testid="place-header">
      <PlaceAvatar kind="project" id={userId} name={username} size="lg" />
      <div className="min-w-0 flex-1">
        <h2 className="text-h2 font-semibold text-text-primary">Chat</h2>
        <p className="mt-0.5 text-body text-text-secondary">{DESCRIPTION}</p>
      </div>
    </div>
  )
}
