/**
 * The host service's own identity (host-management spec §4 C3, §6): an Ed25519 key to sign what it sends a
 * controller and an X25519 key that envelopes to it are sealed to, made once, on first need, and kept in the state
 * folder readable by its owner only. Its fingerprint is what a fleet admin compares when the machine connects.
 *
 * A stored identity that cannot be read is an error, never replaced: a new key would silently break every pin a
 * Fleet Console holds of this machine.
 */
import { fingerprintOf, generateHostKeys, isHostIdentity, type HostKeys } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'

const FILE = ['identity', 'keys.json']

const made = new Map<string, Promise<HostKeys>>()

function parse(value: unknown, file: string): HostKeys {
  const v = value as Partial<HostKeys> | null
  if (!v || !isHostIdentity(v.identity) || v.identity.role !== 'host' ||
    typeof v.signingPrivateKey !== 'string' || typeof v.sealingPrivateKey !== 'string') {
    throw new Error(`${file} does not hold this machine's keys; the host service will not make new ones over it.`)
  }
  return { identity: v.identity, signingPrivateKey: v.signingPrivateKey, sealingPrivateKey: v.sealingPrivateKey }
}

async function loadOrMake(state: StateFolder): Promise<HostKeys> {
  const stored = state.readJson(...FILE)
  if (stored !== null) return parse(stored, state.path(...FILE))
  const keys = await generateHostKeys('host')
  state.writeJson(FILE, keys)
  return keys
}

/** This machine's keys, made the first time they are asked for. One promise per state folder, so two callers never make two. */
export function hostKeys(state: StateFolder): Promise<HostKeys> {
  let keys = made.get(state.root)
  if (!keys) {
    keys = loadOrMake(state)
    made.set(state.root, keys)
    keys.catch(() => made.delete(state.root))
  }
  return keys
}

export async function hostFingerprint(state: StateFolder): Promise<string> {
  return fingerprintOf((await hostKeys(state)).identity)
}
