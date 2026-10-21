import { AlertCircle } from 'lucide-react'

/** A reply that did not finish: what went wrong, in words a person can act on. Kept in the record, so it stays after a reload. */
export function FailedCard({ reason }: { reason: string }) {
  return (
    <div role="status" data-testid="failed-card" className="flex max-w-[720px] items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
      <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="text-small font-medium text-text-primary">The reply did not finish</p>
        <p className="mt-0.5 text-small text-text-secondary">{reason}</p>
      </div>
    </div>
  )
}
