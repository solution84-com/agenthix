import { AlertTriangle } from 'lucide-react'
import { useFailureText } from './FailureWho'

/**
 * Before any reply has failed on it, a conversation that cannot be answered says why in one line, where the message
 * box would be: what is wrong, and who fixes it as the reader needs it. With the one access the person may switch
 * to, the way to take it.
 */
export function AccessLine({ problem, offer, onSwitch }: { problem: string; offer: { label: string } | null; onSwitch: () => void }) {
  const { what, who } = useFailureText(problem)
  return (
    <div role="status" data-testid="access-line" className="mx-4 mb-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning/30 px-3 py-2 text-small text-text-secondary">
      <AlertTriangle size={14} aria-hidden className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1">{what}{who && <> {who}</>}</span>
      {offer && (
        <button type="button" onClick={onSwitch} className="font-medium text-accent hover:underline max-lg:min-h-10">
          Switch to {offer.label}
        </button>
      )}
    </div>
  )
}
