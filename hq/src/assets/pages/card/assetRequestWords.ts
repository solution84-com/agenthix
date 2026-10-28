/** The approval card's words for what a request would change (spec part 5, D31). Client-safe and pure. */
import type { AssetRequestChange } from './assetRequestChange'

type Shown = Exclude<AssetRequestChange, { kind: 'none' }>

export function changeHeading(c: Shown): string {
  const by = c.requestedBy ?? 'An agent'
  switch (c.kind) {
    case 'publish': return `${by} asks you to publish ${c.identity} ${c.to}${c.from ? `, now ${c.from}` : ''}`
    case 'rollBack': return `${by} asks you to roll ${c.identity} back from ${c.from ?? 'its current version'} to ${c.to}`
    case 'switchOn': return `${by} asks you to switch on ${c.skill} in ${c.place}`
    case 'install': return `${by} asks you to install ${c.source}`
  }
}

/** What approving does beyond the change itself: who gets it, and who is recorded as having done it. */
export function changeEffect(c: Shown): string {
  switch (c.kind) {
    case 'publish':
    case 'rollBack':
      return 'You are recorded as having done it, with the request noted. Every agent that has it uses it from its next turn.'
    case 'switchOn':
      return 'It runs for agents working there from their next turn, exactly as its files are now. If they change, it goes off again.'
    case 'install':
      return 'It goes into the Library, checked as when you add it yourself. No agent has it until it is given to them. If it is unsigned or from a publisher you haven\'t trusted, it isn\'t installed: add it from the Library, where you can read it first.'
  }
}

export const staleOf = (c: Shown): string | null => ('stale' in c ? c.stale : null)
