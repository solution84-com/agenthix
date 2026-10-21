import { Link } from 'react-router'

/** The lead's one-line offer of a new conversation when the subject has moved on; never in the way. */
export function NewConversationOffer({ text, href }: { text: string; href: string }) {
  return (
    <p className="text-center text-micro text-text-muted" data-testid="new-conversation-offer">
      {text} ·{' '}
      <Link to={href} className="font-medium text-accent hover:underline max-lg:inline-flex max-lg:min-h-10 max-lg:items-center">
        Start it
      </Link>
    </p>
  )
}
