import { useState } from 'react'
import { Pin, PinOff } from 'lucide-react'
import { getPins, pinItem, unpinItem, useAction, useQuery } from 'wasp/client/operations'
import type { PinKindName, PinnedItem } from '../pinTypes'

type PinButtonProps = { kind: PinKindName; itemId: string; className?: string }

/** Pins or unpins one project, board or agent in the person's navigation. */
export function PinButton({ kind, itemId, className = '' }: PinButtonProps) {
  const { data: pins } = useQuery(getPins)
  const pin = useAction(pinItem)
  const unpin = useAction(unpinItem)
  const [busy, setBusy] = useState(false)

  const pinned = ((pins ?? []) as PinnedItem[]).some((p) => p.kind === kind && p.itemId === itemId)
  const label = pinned ? 'Unpin' : 'Pin'
  const Icon = pinned ? PinOff : Pin

  const toggle = async () => {
    setBusy(true)
    try {
      await (pinned ? unpin({ kind, itemId }) : pin({ kind, itemId }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy || pins === undefined}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
        pinned ? 'text-accent hover:bg-accent-subtle' : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
      } ${className}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}
