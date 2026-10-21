import { PIN_KINDS, type PinKindName } from '@agenthix/core'

/** Declared in core's client protocol, since the mobile app reads them too. */
export { PIN_KINDS } from '@agenthix/core'
export type { PinArgs, PinKindName, PinnedItem } from '@agenthix/core'

export function isPinKind(value: unknown): value is PinKindName {
  return typeof value === 'string' && (PIN_KINDS as readonly string[]).includes(value)
}
