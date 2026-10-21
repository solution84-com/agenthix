import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { HOST_PROTOCOL_VERSION_HEADER, HOST_PROTOCOL_VERSION, checkProtocolCompatibility } from '@agenthix/core'
import { refuseUpgrade } from '../../sites/siteUpgrade'

export function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0]
}

export function headerOf(req: IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()]
  return ((Array.isArray(value) ? value[0] : value) ?? '').trim()
}

export function bearerOf(req: IncomingMessage): string {
  const match = /^Bearer (.+)$/.exec(headerOf(req, 'authorization'))
  return match ? match[1].trim() : ''
}

/**
 * The checks every relay upgrade starts with. A version is optional (frames carry theirs too); one two or more majors
 * apart, or one that cannot be read, is refused with 426 stating hq's own, so the caller can say which side must
 * upgrade. Returns false when the upgrade was refused.
 */
export function precheckUpgrade(req: IncomingMessage, socket: Duplex): boolean {
  // As in siteUpgrade.ts: a client that resets during an await below must not raise an unlistened 'error'.
  socket.on('error', () => {})
  const compatibility = checkProtocolCompatibility(HOST_PROTOCOL_VERSION, headerOf(req, HOST_PROTOCOL_VERSION_HEADER))
  if (!compatibility.ok && compatibility.reason !== 'absent') {
    refuseUpgrade(socket, 426, 'Upgrade Required', { [HOST_PROTOCOL_VERSION_HEADER]: HOST_PROTOCOL_VERSION })
    return false
  }
  // A peer one major behind is spoken to through the code kept for its major. At the first major there is none, so
  // it is accepted as it is; that code, and the test that runs it, start here at the first major change.
  return true
}

export { refuseUpgrade }
