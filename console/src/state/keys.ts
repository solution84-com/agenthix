/**
 * The Fleet Console's own keys: Ed25519 to sign every command, X25519 to be sealed to. Made once, on first start, and
 * kept in the state folder only; every host service pinned their public half when it connected, so losing them means
 * connecting every machine again.
 */
import { generateHostKeys, isHostIdentity, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from './folder'

const FILE = 'keys.json'

export async function loadOrCreateKeys(state: StateFolder): Promise<HostKeys> {
  const stored = state.readJson(FILE)
  if (stored !== null) {
    const k = stored as Partial<HostKeys>
    if (!isHostIdentity(k.identity) || k.identity.role !== 'console' ||
      typeof k.signingPrivateKey !== 'string' || typeof k.sealingPrivateKey !== 'string') {
      throw new Error(`${state.path(FILE)} does not hold the Fleet Console's keys; it will not make new ones over it.`)
    }
    return k as HostKeys
  }
  const keys = await generateHostKeys('console')
  state.writeJson([FILE], keys)
  return keys
}
