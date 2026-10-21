import httpProxy from 'http-proxy'
import type { Request, Response } from 'express'
import type { Agent, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { PREVIEW_ERROR_MARKER, decodePreviewError } from '@agenthix/core'
import { openContentStream } from '../sites/content'
import { previewStreamAgent } from './previewRelay'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Preview')

// The byte relay behind a preview host (previewHost.ts decides who may reach
// it). The whole door is tested against a real server in previewHost.test.ts;
// the upstream connection in previewRelay.test.ts. What only an operator can
// prove is the far end — a real site, and one WebSocket-based dev server to
// show the upgrade crosses too.
//
// ## What ending a row does and does not stop
//
// Authorization is decided once, when a request arrives — so ending a row
// refuses the NEXT request and nothing else. A response already streaming and
// a WebSocket already upgraded keep flowing over the stream they hold, which
// no check here can reach; what finally ends them is the site stopping the
// preview's process, which the sweep asks for. So "the preview ends at once" is
// exactly true of new requests and of nothing else, and a long-lived socket a
// browser opened before the preview ended can outlive it by a sweep interval.
// That is the honest limit of a per-request check in front of a byte relay,
// not an oversight.

/**
 * Where the bytes go.
 *
 * A preview is a process inside a container on an Execution Site, and a site
 * accepts no inbound connection and publishes no port — so there is no address
 * on this machine, or on any network hq can see, that reaches one. The route
 * is a stream the site itself opened outward, and `previewStreamAgent` is what
 * turns that stream into something an ordinary HTTP proxy can forward over.
 *
 * The target is therefore never resolved: the agent supplies the connection
 * before anything would look the host up. It is written as loopback rather
 * than as an obviously-unreal name because `changeOrigin` makes it the `Host`
 * header the dev server sees, and a dev server that checks that header — Vite
 * does — must see one it accepts. Loopback is also the literal truth: the
 * far end of the stream connects to `127.0.0.1:<port>` inside the container.
 */
const PREVIEW_TARGET = 'http://127.0.0.1'

/** One agent per request, so no connection can outlive the preview it was
 *  authorized for. See previewRelay.ts for why that is structural. */
export function agentFor(session: { siteId: string; previewId: string }) {
  return previewStreamAgent(session.siteId, session.previewId, openContentStream)
}

/**
 * The site's own vocabulary, read back out of whatever sentence the relay
 * wrapped it in.
 *
 * Searched for rather than matched at the start: by the time an error reaches
 * here the relay has already said which preview and which site could not be
 * reached, so ours sits at the end of that sentence.
 */
function decodeFromMessage(message: string): ReturnType<typeof decodePreviewError> {
  const at = message.indexOf(PREVIEW_ERROR_MARKER)
  return at < 0 ? null : decodePreviewError(message.slice(at))
}

/**
 * The one upstream failure that says something about hq's own row rather than
 * about the network: the site has looked the preview up and does not know it.
 *
 * A site's preview registry is in memory and dies with the site, so this is
 * the ordinary answer after a site restart — and it is the trigger that needs
 * no clock. The row is the only thing still claiming the preview exists, so it
 * is ended here rather than left to resolve until its TTL runs out.
 */
export function previewIsGone(err: Error): boolean {
  return decodeFromMessage(err.message)?.code === 'not_found'
}

/**
 * What a viewer reads, out of what the transport raised.
 *
 * A refusal from the site crosses in this vocabulary's own wire encoding —
 * `preview/<code>: <detail>` — which is ours and not a person's, and the
 * detail behind it names the site's own method. A browser showing
 * `preview/not_found:` is showing somebody our protocol. So the code is
 * decoded and answered in prose, the same thing `readable()` in
 * startPreviewTool.ts does for the tool path; anything that is not one of
 * ours is already prose and passes through.
 *
 * The encoding is searched for rather than matched at the start: by the time
 * an error reaches here the relay has already said which preview and which
 * site could not be reached, so ours sits at the end of that sentence.
 */
export function viewerMessage(err: Error): string {
  const decoded = decodeFromMessage(err.message)
  if (!decoded) return err.message
  switch (decoded.code) {
    case 'not_found':
      return 'that preview is no longer running on its Execution Site — start it again'
    case 'no_container':
      return 'nothing is running in that storage any more, so there is no container serving the preview'
    case 'not_ready':
      return 'the preview has not answered on its own port'
    case 'exec_failed':
      return "the preview stopped answering on its Execution Site — the site's own log says why"
    case 'invalid':
      return 'hq asked the Execution Site for this preview in a shape it does not accept'
  }
}

/**
 * A failed forward, answered as far as the response still allows.
 *
 * Once the headers have gone there is no way left to tell the browser
 * anything: `res.status()` on a sent response throws `ERR_HTTP_HEADERS_SENT`
 * from inside a `ClientRequest`'s own error handler, which is uncaught and
 * takes hq down — and inventing an error body would corrupt the asset being
 * served. Destroying the response is the honest signal, and the reason goes
 * to hq's log, where an operator can reach it.
 *
 * That covers the transport's unread-buffer limit too, which can only ever
 * fire mid-response: a viewer on a slow link loses a large asset and is told
 * nothing. The silence is deliberate, not an oversight.
 *
 * Exported so the after-headers case can be tested against a real express
 * response and a real mid-response failure — nothing else here can be.
 */
export async function failForward(res: Response, err: Error, gone?: () => Promise<void>): Promise<void> {
  // Before the response, because the answer differs: a preview the site does
  // not know is not an upstream fault to retry, it is an address that no
  // longer names anything, and 404 is what says so.
  if (previewIsGone(err) && gone) {
    try {
      await gone()
    } catch (e) {
      logger.warn(`could not end a row the site no longer knows: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (res.headersSent) {
    logger.warn(`upstream failed after the response had started: ${err.message}`)
    res.destroy(err)
    return
  }
  if (previewIsGone(err)) {
    res.status(404).send(viewerMessage(err))
    return
  }
  res.status(502).send(`preview upstream error: ${viewerMessage(err)}`)
}

const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true })

/**
 * HTTP: forward one already-authorized request to the preview's dev server,
 * path unchanged — the preview is served at its own host's root (adr-0071).
 */
export function relayWeb(req: Request, res: Response, agent: Agent, gone: () => Promise<void>): void {
  proxy.web(req, res, { target: PREVIEW_TARGET, agent }, (err: Error) => {
    // Nothing awaits this callback, so the only place a rejection could
    // surface is an unhandled one that takes hq down.
    void failForward(res, err, gone).catch(e => logger.error('failed to answer a failed forward', e))
  })
}

/** WebSocket upgrade: the twin of `relayWeb`, for a dev server's live reload. */
export function relayWs(req: IncomingMessage, socket: Duplex, head: Buffer, agent: Agent, gone: () => Promise<void>): void {
  // The callback, not a try/catch: an open that fails does so on a later
  // tick, so the only thing a catch here could ever have caught is a
  // synchronous throw out of the proxy's own pass.
  //
  // There is nothing to say to the other end either way — an upgrade that
  // fails before the 101 leaves a socket nobody has spoken HTTP on, and one
  // that fails after it is mid-frame. So this destroys and logs, for the
  // same reason `failForward` does once headers are sent.
  proxy.ws(req, socket, head, { target: PREVIEW_TARGET, agent }, (err: Error) => {
    logger.warn(`upstream failed on a WebSocket upgrade: ${err.message}`)
    // A site that says it does not know the preview ends the row here too.
    // Otherwise a dev server's own socket would be the one door that kept a
    // dead preview alive until its TTL.
    if (previewIsGone(err)) {
      void gone().catch(e => logger.warn('could not end a row the site no longer knows', e))
    }
    socket.destroy()
  })
}

export function startingPage(): string {
  return `<!doctype html><meta http-equiv="refresh" content="2"><body style="font-family:sans-serif;background:#0d0d14;color:#ccc;display:grid;place-items:center;height:100vh">starting preview…</body>`
}
