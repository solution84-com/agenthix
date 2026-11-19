/**
 * The pace and listening style of each conversation, in the page's memory only (spec §When a turn ends → *Adaptive
 * pacing*): voice can stop and start again within a conversation and carry on where it was. Nothing here is written to
 * the conversation, the database, the browser's storage or hq; a reload starts from the defaults. Never per person.
 */
import type { Adapter } from '../runtime/types'
import { isNormal, type ListenStyleState } from './style'

type Remembered = { heard: number; breathMs: number[]; style: ListenStyleState | null }

const memory = new Map<string, Remembered>()

/** What the page holds for a conversation, if anything. */
export const remembered = (conversationId: string): Readonly<Remembered> | undefined => memory.get(conversationId)

/** Forgets every conversation, as a reload would. */
export function forgetPaces(): void {
  memory.clear()
}

export function paceMemory(deps: { conversationId: () => string | null }): Adapter {
  return {
    name: 'paceMemory',
    start(runtime) {
      const id = deps.conversationId()
      const held = id ? memory.get(id) : undefined
      if (held?.breathMs.length) runtime.publish({ kind: 'orchestration.paceRestore', heard: held.heard, breathMs: [...held.breathMs], t: runtime.now() })
      if (held?.style && !isNormal(held.style)) runtime.publish({ kind: 'listen.style', state: held.style, restored: true, t: runtime.now() })
      const keep = (patch: Partial<Remembered>) => {
        const at = deps.conversationId()
        if (!at) return
        memory.set(at, { heard: 0, breathMs: [], style: null, ...memory.get(at), ...patch })
      }
      return runtime.subscribe(['orchestration.pace', 'listen.style'], e => {
        if (e.kind === 'orchestration.pace') keep({ heard: e.heard, breathMs: [...e.breathMs] })
        else if (e.kind === 'listen.style' && !e.restored) keep({ style: e.state })
      })
    },
  }
}
