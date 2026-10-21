/**
 * The byte relay between a browser's connection to hq and a `preview.connect`
 * stream to the site (ADR-0063's separable relay).
 *
 * It is an `http.Agent` whose `createConnection` returns a content stream
 * instead of a TCP socket. That is the whole trick, and it is what lets the
 * proxy in front of it stay an ordinary HTTP proxy: everything that already
 * knows how to speak HTTP and how to upgrade a connection to a WebSocket goes
 * on working, over a socket that happens to be a multiplexed stream to a
 * machine with no open ports.
 *
 * ADR-0063 calls the relay a separable component, and this module is where
 * that promise is kept: it imports nothing from hq's domain — no prisma, no
 * entitlement, no session — only a function that opens a stream. Giving it its
 * own process later means giving it a different `open`.
 *
 * `keepAlive` is false and each agent belongs to one preview: a pooled socket
 * reused across previews would carry one boundary's bytes to another's
 * viewer, which no check above it could catch. The agent is constructed from
 * a site and a preview and holds no way to be pointed at another pair, so a
 * stream it opens can only ever be that preview's — that is the property, and
 * it is structural rather than a rule somebody has to keep.
 *
 * ## What a content stream has to pretend about itself
 *
 * `http-proxy` runs `common.setupSocket` over the upstream connection on the
 * upgrade path, which calls `setTimeout`, `setNoDelay` and `setKeepAlive` —
 * none of which a `Duplex` has. Without them a WebSocket upgrade throws a
 * `TypeError` out of a `ClientRequest`'s own event handler, uncaught, and
 * takes the process with it. So a stream is given the three as no-ops before
 * it is handed over. Nothing else socket-shaped is reached: the agent's other
 * route into `net.Socket`'s API is the default `keepSocketAlive`, which
 * `unref`s the socket it is about to pool, and this agent never pools one.
 */
import http from 'node:http'
import type { Duplex } from 'node:stream'
import { PREVIEW_METHODS } from '@agenthix/core'

/**
 * The one thing this module needs from whatever is above it: open a stream to
 * a site under a named method. Deliberately the shape of a transport call and
 * not of hq's own registry.
 */
export type OpenPreviewStream = (siteId: string, method: string, params: unknown) => Promise<Duplex>

/** The three `net.Socket` methods `http-proxy` calls on an upstream connection. */
interface SocketShapedMethods {
  setTimeout(timeout: number, callback?: () => void): Duplex
  setNoDelay(noDelay?: boolean): Duplex
  setKeepAlive(enable?: boolean, initialDelay?: number): Duplex
}

function asSocketShaped(stream: Duplex): Duplex {
  const shaped = stream as Duplex & Partial<SocketShapedMethods>
  if (!shaped.setTimeout) shaped.setTimeout = () => shaped
  if (!shaped.setNoDelay) shaped.setNoDelay = () => shaped
  if (!shaped.setKeepAlive) shaped.setKeepAlive = () => shaped
  return shaped
}

class PreviewStreamAgent extends http.Agent {
  constructor(
    private readonly siteId: string,
    private readonly previewId: string,
    private readonly open: OpenPreviewStream,
  ) {
    super({ keepAlive: false })
  }

  /**
   * One fresh stream per connection, and the only params it ever carries are
   * the preview's own id — the site resolves the container and the port from
   * its own registry (ADR-0051: no caller may name a destination).
   *
   * Async through the callback rather than returned: an open that fails then
   * reaches the request as an ordinary `error`, which is what turns an
   * unreachable site into a 502 with a message instead of a hung request.
   */
  override createConnection(
    _options: http.ClientRequestArgs,
    callback?: (err: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    this.open(this.siteId, PREVIEW_METHODS.connect, { previewId: this.previewId }).then(
      stream => callback?.(null, asSocketShaped(stream)),
      (err: unknown) => {
        // There is no connection to hand over, and node's own `oncreate`
        // ignores its second argument once the first is an error — it emits
        // the error on the request and returns. The signature demands one all
        // the same, so this cast is where that asymmetry is paid for.
        callback?.(unreachable(this.siteId, this.previewId, err), undefined as unknown as Duplex)
      },
    )
    return undefined
  }

  /**
   * Never pool. The base implementation keeps a finished socket for the next
   * request; returning false destroys it instead, so "one stream per
   * connection" cannot quietly stop being true if this agent is ever
   * constructed with different options.
   */
  override keepSocketAlive(): boolean {
    return false
  }
}

/**
 * An `http.Agent` whose every connection is a fresh `preview.connect` stream
 * to one preview on one site.
 *
 * Returned as a plain `http.Agent` because that is all a caller may do with
 * it: hand it to a proxy as `options.agent`.
 */
export function previewStreamAgent(siteId: string, previewId: string, open: OpenPreviewStream): http.Agent {
  return new PreviewStreamAgent(siteId, previewId, open)
}

/**
 * Names the site, because "which machine is not answering" is the only part of
 * this an operator can act on, and the message ends up in front of whoever
 * opened the preview.
 */
function unreachable(siteId: string, previewId: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new Error(`preview ${previewId} on Execution Site ${siteId} could not be reached: ${detail}`)
}
