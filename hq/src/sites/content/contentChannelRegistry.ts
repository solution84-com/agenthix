import { StreamMux, CONTENT_OPEN_TIMEOUT_MS, type StreamEvents } from '@agenthix/core'
import { ContentStream, ContentStreamFailed } from './contentStream'

/** The slice of a `ws` socket the registry uses — narrow, so tests need no network. */
export interface ContentSocket {
  send(data: string | Uint8Array, cb?: (err?: Error) => void): void
  close(code?: number, reason?: string): void
  readonly readyState: number
  readonly OPEN: number
}

export type ContentConnection = { socket: ContentSocket; mux: StreamMux }

/**
 * One content connection per site — its own registry, never
 * SiteChannelRegistry, which closes any second socket from the same site and
 * would evict the control channel.
 *
 * It never writes ONLINE or OFFLINE. Whether a site is online is the control
 * channel's call alone; a site whose content link is down is still online.
 */
export class ContentChannelRegistry {
  private readonly connections = new Map<string, ContentConnection>()

  add(siteId: string, socket: ContentSocket): StreamMux {
    const previous = this.connections.get(siteId)
    if (previous && previous.socket !== socket) {
      previous.mux.closeAll('disconnected', 'Replaced by a newer content connection from the same site')
      previous.socket.close(4000, 'Replaced by a newer connection')
    }
    const mux = new StreamMux('opener', {
      sendText: text => {
        if (socket.readyState === socket.OPEN) socket.send(text)
      },
      sendBinary: bytes =>
        new Promise((resolve, reject) => {
          if (socket.readyState !== socket.OPEN) {
            reject(new ContentStreamFailed('Content connection is not open', 'disconnected'))
            return
          }
          socket.send(bytes, err => (err ? reject(err) : resolve()))
        }),
    })
    this.connections.set(siteId, { socket, mux })
    return mux
  }

  remove(siteId: string, socket: ContentSocket): void {
    const current = this.connections.get(siteId)
    // Only the registered socket may clear the entry — a displaced one closes moments after its replacement registers.
    if (!current || current.socket !== socket) return
    this.connections.delete(siteId)
    current.mux.closeAll('disconnected', 'Content connection closed')
  }

  revoke(siteId: string): void {
    const conn = this.connections.get(siteId)
    if (!conn) return
    this.connections.delete(siteId)
    conn.mux.closeAll('disconnected', 'Execution Site revoked')
    conn.socket.close(4001, 'Site revoked')
  }

  current(siteId: string): ContentConnection | null {
    return this.connections.get(siteId) ?? null
  }

  /** As SiteChannelRegistry.closeForRotation: the content socket authenticated with the same credential. */
  closeForRotation(siteId: string, only?: ContentConnection): void {
    const conn = this.connections.get(siteId)
    if (!conn || (only && conn !== only)) return
    conn.socket.close(4002, 'Credential rotated')
  }

  isConnected(siteId: string): boolean {
    return this.connections.has(siteId)
  }

  /**
   * Resolves once the site accepts; the returned stream is then readable and
   * writable.
   *
   * The site's accept, data or error can arrive before `mux.open()` returns —
   * a socket whose send delivers synchronously does exactly that. So nothing
   * here assumes an ordering: events that arrive before the stream exists are
   * queued and replayed onto it, and the promise settles only once the stream
   * is both accepted and attached.
   */
  open(siteId: string, method: string, params: unknown, timeoutMs: number = CONTENT_OPEN_TIMEOUT_MS): Promise<ContentStream> {
    const conn = this.connections.get(siteId)
    if (!conn) {
      return Promise.reject(new ContentStreamFailed(`Execution Site ${siteId} has no content connection`, 'offline'))
    }

    return new Promise((resolve, reject) => {
      let settled = false
      let accepted = false
      let id = -1
      let stream: ContentStream | null = null
      let events: StreamEvents | null = null
      const queued: Array<(e: StreamEvents) => void> = []
      const deliver = (fn: (e: StreamEvents) => void) => {
        if (events) fn(events)
        else queued.push(fn)
      }

      const settleIfReady = () => {
        if (settled || !accepted || !stream) return
        settled = true
        clearTimeout(timer)
        resolve(stream)
      }

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        conn.mux.cancel(id)
        stream?.destroy()
        reject(new ContentStreamFailed(`Execution Site ${siteId} did not accept ${method} in time`, 'timeout'))
      }, timeoutMs)
      timer.unref?.()

      id = conn.mux.open(method, params, {
        onAccept: () => {
          accepted = true
          settleIfReady()
        },
        onData: payload => deliver(e => e.onData(payload)),
        onEnd: () => deliver(e => e.onEnd()),
        onError: (code, message) => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            reject(new ContentStreamFailed(message, code))
            return
          }
          deliver(e => e.onError(code, message))
        },
      })

      // The open failed synchronously — nothing to attach.
      if (settled) return

      const attached = ContentStream.attach(conn.mux, id)
      stream = attached.stream
      events = attached.events
      for (const fn of queued.splice(0)) fn(events)
      settleIfReady()
    })
  }
}
