/**
 * At its stop signal (`docker stop`, a shutdown, a restart), the host service tells its pinned Fleet Console it stops
 * on purpose, so its card reads "Stopped on its machine" rather than "Not answering" (core's stopping.ts). One sealed
 * `stopping` envelope through the link, bounded by `HOST_STOPPING_BUDGET_MS`: with no link up or no pin, nothing is
 * sent and the stop goes on at once; nothing here can hold the stop past the budget.
 */
import { HOST_STOPPING_BUDGET_MS, type HostEnvelope } from '@agenthix/core'
import { sealEnvelope, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import { readPin } from './pin'

export type StoppingLink = {
  connected: () => boolean
  sendEnvelope: (envelope: HostEnvelope) => void
  /** Whether everything sent has left this process; without it, sent is taken as gone. */
  drained?: () => boolean
}

export type StoppingDeps = {
  state: StateFolder
  keys: () => Promise<HostKeys>
  link: StoppingLink
  budgetMs?: number
}

const DRAIN_POLL_MS = 20

/** True once the stop word has left this process; false when there was no one to tell, or the budget ran out. */
export async function sayStopping(d: StoppingDeps): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), d.budgetMs ?? HOST_STOPPING_BUDGET_MS) })
  let over = false
  const tell = async (): Promise<boolean> => {
    const pin = readPin(d.state)
    if (!pin || !d.link.connected()) return false
    const envelope = await sealEnvelope({ sender: await d.keys(), recipient: pin.console, message: { kind: 'stopping' } })
    if (over || !d.link.connected()) return false
    d.link.sendEnvelope(envelope)
    while (d.link.drained && !d.link.drained() && !over) await new Promise(r => setTimeout(r, DRAIN_POLL_MS))
    return !over
  }
  try {
    return await Promise.race([tell().catch(() => false), budget])
  } finally {
    over = true
    clearTimeout(timer)
  }
}
