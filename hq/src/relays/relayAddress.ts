import type { RelayAddress } from '@agenthix/core'
import type { Relay } from '@prisma/client'
import { filesPlace } from '../server/files/filesOrigin'
import { getSiteClientUrl } from '../server/siteConfig'

/**
 * Where a browser reaches a relay's tickets. hq's relay answers on the files address, reached through `hq-web` on the
 * address browsers use (the client's: in development Vite, which passes `/t/` to the relay); with no name for files,
 * on hq's own address under the bare door. Any other relay on its own address. Null when it has none to give.
 */
export function browserAddressOf(relay: Pick<Relay, 'isHq' | 'address'>, env: NodeJS.ProcessEnv = process.env): RelayAddress | null {
  if (relay.isHq) {
    const place = filesPlace(env, getSiteClientUrl())
    return { origin: place.origin, door: place.mode === 'origin' ? 'files-address' : 'bare-address' }
  }
  if (!relay.address) return null
  try {
    return { origin: new URL(relay.address).origin, door: 'files-address' }
  } catch {
    return null
  }
}
