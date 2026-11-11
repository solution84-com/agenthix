import type { ReactNode } from 'react'
import type { Refusal } from '@agenthix/ui/primitives'
import { useFailureText } from './FailureWho'

/**
 * Before any reply has failed on it, a conversation that cannot be answered greys its message box: the tooltip says
 * what is wrong, and a press says who fixes it as the reader needs it, with the one access the person may switch to,
 * the way to take it.
 */
export function AccessRefusal({ problem, offer, onSwitch, children }: {
  problem: string
  offer: { label: string } | null
  onSwitch: () => void
  children: (refusal: Refusal) => ReactNode
}) {
  const { what, who } = useFailureText(problem)
  return <>{children({
    reason: what,
    title: 'This conversation cannot be answered yet',
    detail: <>{what}{who && <> {who}</>}</>,
    actions: offer ? [{ label: `Switch to ${offer.label}`, onClick: onSwitch, variant: 'primary' }] : undefined,
  })}</>
}
