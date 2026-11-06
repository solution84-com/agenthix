import { AlertCircle, RotateCcw } from 'lucide-react'
import { useFailureText } from './FailureWho'

/** The one access the person may switch to when the model the conversation talks on cannot be used. */
export type SwitchOffer = { label: string; onSwitch: () => void }

/**
 * A reply that did not finish, as the turn's own words: what happened (naming the provider), then who can fix it as
 * the reader needs it, and Try again. Kept in the record, so it stays after a reload.
 */
export function FailedCard({ reason, onTryAgain, offer }: { reason: string; onTryAgain?: () => void; offer?: SwitchOffer | null }) {
  const { what, who } = useFailureText(reason)
  return (
    <div role="status" data-testid="failed-card" className="flex max-w-[720px] items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
      <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium text-text-primary">The reply did not finish</p>
        <p className="mt-0.5 text-small text-text-secondary">{what}</p>
        {who && <p className="mt-0.5 text-small text-text-secondary" data-testid="failed-who">{who}</p>}
        {(offer || onTryAgain) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {offer && (
              <button type="button" onClick={offer.onSwitch} className="text-small font-medium text-accent hover:underline max-lg:min-h-10">
                Switch to {offer.label}
              </button>
            )}
            {onTryAgain && (
              <button
                type="button"
                onClick={onTryAgain}
                className="inline-flex items-center gap-1.5 text-small font-medium text-text-secondary hover:text-text-primary max-lg:min-h-10"
              >
                <RotateCcw size={14} aria-hidden />
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
