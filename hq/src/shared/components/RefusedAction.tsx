/**
 * The one way a refused action of the person's own is shown: the server's reason in words, in place, with a way
 * to dismiss it. Feed it `refusalText(err)`.
 */
export function RefusedAction({ reason, onDismiss, className = '' }: { reason: string | null | undefined; onDismiss?: () => void; className?: string }) {
  if (!reason) return null
  return (
    <p role="alert" data-testid="refused-action" className={`flex items-start justify-between gap-3 text-small text-danger ${className}`.trim()}>
      <span className="min-w-0 break-words">{reason}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 text-text-muted hover:text-text-primary max-lg:min-h-10">
          Dismiss
        </button>
      )}
    </p>
  )
}
