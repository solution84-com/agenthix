/**
 * The host service's one outward connection to HQ's port (host-management spec §4 C3): a WebSocket to
 * `/host-link`, with Node's own client. Tests stand in a fake `Dial`. Nothing here listens.
 */
import { HQ_HOST_LINK_PATH, HOST_ENVELOPE_MAX_BODY_BYTES } from '@agenthix/core'
import { addressProblem } from '../install/address'

/** A frame larger than this is dropped unread: an envelope at its largest, base64url, with room for the frame. */
export const MAX_FRAME_CHARS = Math.ceil(((HOST_ENVELOPE_MAX_BODY_BYTES + 16) * 4) / 3) + 16 * 1024

export type SocketEvents = {
  open: () => void
  message: (text: string) => void
  /** Once, whether it opened or not. */
  close: () => void
}

export type LinkSocket = {
  send: (text: string) => void
  close: () => void
  /** Whether everything sent has been handed to the network; a fake may leave it out. */
  drained?: () => boolean
}

export type Dial = (url: string, headers: Record<string, string>, events: SocketEvents) => LinkSocket

export const dialWebSocket: Dial = (url, headers, events) => {
  // Node's client takes headers beside the protocols; the DOM typing does not know them.
  const ws = new WebSocket(url, { headers } as unknown as string[])
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    events.close()
  }
  ws.onopen = () => events.open()
  ws.onmessage = e => {
    if (typeof e.data === 'string' && e.data.length <= MAX_FRAME_CHARS) events.message(e.data)
  }
  ws.onerror = () => close()
  ws.onclose = () => close()
  return {
    send: text => {
      if (ws.readyState === WebSocket.OPEN) ws.send(text)
    },
    drained: () => ws.bufferedAmount === 0,
    close: () => {
      try {
        ws.close()
      } catch {
        // already closing
      }
      close()
    },
  }
}

/** `/host-link` on HQ's address, as a WebSocket address. */
export function hostLinkUrl(hqAddress: string): string {
  const url = new URL(HQ_HOST_LINK_PATH, hqAddress)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function isLocalOrPrivate(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1') return true
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!m) return false
  const a = Number(m[1]), b = Number(m[2])
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Why this machine will not connect to HQ at `address`, in words; null when it will. The machine credential travels
 * on this connection for as long as it is open, so plain http is taken only on this machine or a private network,
 * as a site does when it registers.
 */
export function hqAddressProblem(address: string): string | null {
  const problem = addressProblem(address)
  if (problem) return problem
  const url = new URL(address)
  if (url.protocol === 'https:' || isLocalOrPrivate(url.hostname)) return null
  return 'plain http would carry this machine\'s credential unencrypted across a network; use HQ\'s https address'
}
