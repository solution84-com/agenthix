import { prisma } from 'wasp/server'
import { hashCredential } from '../sites/credentials'
import { hqMachineName } from '../sites/defaultSite'
import { filesPlace } from '../server/files/filesOrigin'

/**
 * hq's own relay is configuration, not enrolment (adr-0153, adr-0154), as hq's site is (adr-0070): one secret in
 * hq-server's and the relay's environment, `HQ_RELAY_SECRET`. hq keeps the single `isHq` row with the secret's hash,
 * and the relay presents the secret on its link. A wiped database is rebuilt from the same secret at the next start.
 */

const MIN_SECRET_LENGTH = 32

/** What hq logs at boot when it has no relay of its own. A person reads it in hq's log. */
export const NO_HQ_RELAY_MESSAGE =
  "Files can't be opened: HQ_RELAY_SECRET is not set (or is shorter than 32 characters), so HQ's relay cannot " +
  'connect. Set it in HQ\'s and the relay\'s environment, then restart both.'

export function hqRelaySecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.HQ_RELAY_SECRET?.trim()
  return value && value.length >= MIN_SECRET_LENGTH ? value : null
}

/** The files address hq's relay answers on: the files origin, or hq's own address when there is none. */
function hqRelayAddress(): string {
  return filesPlace().origin
}

/**
 * At most one `isHq` row, found and updated, never created twice. Without the secret an existing row is taken out of
 * service — its credential cleared, so a relay still holding the old secret is refused — and nothing is placed on it.
 */
export async function ensureHqRelay(): Promise<'created' | 'updated' | 'unchanged' | 'unset'> {
  const secret = hqRelaySecret()
  const existing = await prisma.relay.findFirst({ where: { isHq: true } })

  if (!secret) {
    if (existing && (existing.state !== 'REMOVED' || existing.credentialHash !== null)) {
      await prisma.relay.update({ where: { id: existing.id }, data: { state: 'REMOVED', credentialHash: null } })
    }
    return 'unset'
  }

  const credentialHash = hashCredential(secret)
  const name = hqMachineName()
  const address = hqRelayAddress()
  if (!existing) {
    await prisma.relay.create({ data: { name, address, isHq: true, credentialHash, state: 'ON' } })
    return 'created'
  }
  const removed = existing.state === 'REMOVED'
  if (existing.credentialHash === credentialHash && !removed && existing.name === name && existing.address === address) {
    return 'unchanged'
  }
  await prisma.relay.update({
    where: { id: existing.id },
    data: { credentialHash, name, address, ...(removed ? { state: 'ON' } : {}) },
  })
  return 'updated'
}
