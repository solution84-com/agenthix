/**
 * `preview.connect` — a byte stream to a running preview (ADR-0063).
 *
 * The params carry ONE thing: a previewId this site minted. Never a host,
 * never a port, never a container. A stream method whose caller could name a
 * destination would be the generic relay ADR-0051 refuses — the whole reason
 * preview gets its own transport instead of a carve-out on the control
 * channel. The destination is resolved here, from this site's own registry,
 * and an id the registry does not hold is `not_found` rather than a guess.
 *
 * The bytes reach the dev server through `docker exec -i`, running the same
 * relay the readiness probe uses (`agents/preview/relayScript.ts`) inside the
 * container's own network namespace, rather than through a published port.
 * Two reasons, and the second is the important one: a container that
 * publishes a port is a container created differently from the one a run got,
 * and a preview must not change how a boundary's container is built. (The
 * first is prosaic — a container's address is not routable from the host on
 * every platform the site runs on.) Because the exec runs inside that
 * namespace, a dev server bound to loopback is reachable, which removes the
 * "bind 0.0.0.0" instruction the old error message had to give.
 *
 * This handler ENDS ITS OWN WRITABLE HALF and never reads the request with
 * `for await`, per contentMethods.ts's contract for every handler here — it
 * pipes the request instead, which is what keeps hq's half-close meaning
 * "the browser stopped sending" rather than "the stream is over".
 *
 * ## How it ends
 *
 * A viewer closing a tab is the ordinary ending, not a failure: hq destroys
 * the stream, this kills the exec and RESOLVES. Three things refuse instead —
 * params that are not a preview id, an id this site does not know, and an
 * exec that produced no byte at all, which is what a preview whose port has
 * stopped answering looks like from here. The last matters because an empty
 * stream reaches hq as a bare socket hang up with nothing in it for the
 * person to read.
 */
import { spawn } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { z } from 'zod'
import {
  PREVIEW_METHODS,
  PreviewError,
  type Exact,
  type PreviewConnectParams,
} from '@agenthix/core'
import type { ContentStream } from './contentStream'
import { previewRelayArgs } from '../../../agents/preview/relayScript'
import * as registryModule from '../../../agents/preview/previewRegistry'
import { Logger } from '../../utils/logger'

const logger = new Logger('preview')
const METHOD = PREVIEW_METHODS.connect

/** How long the exec has to produce its first byte. Matches the ready wait a
 *  preview's own start allows, for the same reason: a dev server's first
 *  compile is the slow case, and it is slow once. */
const FIRST_BYTE_TIMEOUT_MS = 60_000

/** Only `previewId` is read: a container or a port in the params is dropped, never used. */
const previewConnectParams = z.object({ previewId: z.string().min(1) })

/** Pinned against CORE's shape, as the control methods' schemas are: a field
 *  added there would otherwise be refused at runtime with everything still
 *  compiling. */
const _wireMirrorsCore: Exact<z.infer<typeof previewConnectParams>, PreviewConnectParams> = true
void _wireMirrorsCore

/** The exec, reduced to what a relay needs of it — so a test can be one pair
 *  of streams rather than a container. */
export interface PreviewRelayProcess {
  stdin: Writable
  stdout: Readable
  kill: () => void
}

export interface PreviewConnectDeps {
  /** Where this site's own registry says the preview is. Null for an id it does not hold. */
  lookup: (previewId: string) => { container: string; port: number } | null
  exec: (container: string, port: number) => PreviewRelayProcess
}

const realDeps: PreviewConnectDeps = {
  lookup: previewId => registryModule.get(previewId) ?? null,
  exec: (container, port) => {
    // `-i` is the whole difference from the probe's exec: with stdin attached
    // the same relay is a bidirectional pipe for as long as this holds it.
    const child = spawn('docker', ['exec', '-i', container, ...previewRelayArgs(port)])
    // docker's own complaint goes to the operator's log and nowhere else: it
    // can name this machine, and a handler's message crosses to hq verbatim.
    child.stderr.on('data', chunk => logger.warn(`[preview] ${METHOD} exec: ${String(chunk).trim()}`))
    return {
      stdin: child.stdin,
      stdout: child.stdout,
      kill: () => {
        child.kill('SIGKILL')
      },
    }
  },
}

export async function handlePreviewConnect(
  stream: ContentStream,
  params: unknown,
  deps: PreviewConnectDeps = realDeps,
): Promise<void> {
  const parsed = previewConnectParams.safeParse(params)
  if (!parsed.success) {
    throw new PreviewError('invalid', `${METHOD} was called with parameters it does not accept`)
  }
  const { previewId } = parsed.data

  const entry = deps.lookup(previewId)
  if (!entry) {
    // Nothing is opened for an id this site does not hold, and nothing is
    // guessed at: an id whose container was swept, or which this site never
    // minted, reads the same way and is the same answer.
    throw new PreviewError('not_found', `${METHOD} names a preview this site is not running`)
  }

  // Before anything is exec'd: hq can have gone away while this handler was
  // being scheduled, and an exec started for a stream nobody is holding is a
  // `docker exec` that outlives the reason for it.
  if (stream.destroyed || stream.writableEnded) return

  await relay(stream, deps.exec(entry.container, entry.port))
}

/**
 * Both directions, and the four ways either can stop.
 *
 * `end: false` on the outbound pipe with an explicit `end` after it, exactly
 * as the location read does and for the same reason: the writable half has to
 * be ended by hand for hq to see an `end` frame at all.
 */
function relay(stream: ContentStream, proc: PreviewRelayProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    // The window between the check above and here is one synchronous call
    // wide, but the guarantee that nothing is left running should not rest on
    // that: a stream already gone has no listeners to attach and nothing to
    // settle it, and the exec would be left holding a pipe forever.
    if (stream.destroyed) {
      proc.kill()
      resolve()
      return
    }

    let settled = false
    let wrote = 0

    const done = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(firstByte)
      stream.off('error', onStreamGone)
      stream.off('close', onStreamClose)
      // Always, on every exit: the exec outlives this promise otherwise, and a
      // `docker exec` nobody is reading from holds a pipe open in the
      // container for as long as the site runs.
      proc.kill()
      if (err) reject(err)
      else resolve()
    }

    // hq going away is the ordinary ending — a person closed the tab. The
    // stream is already gone, so there is nothing to end and nothing to fail.
    const onStreamGone = () => done()
    const onStreamClose = () => done()

    stream.on('error', onStreamGone)
    stream.on('close', onStreamClose)
    // Killing on a write failure rather than settling here: the exec's own
    // stdout is about to end, and that path already says what happened.
    proc.stdin.on('error', () => proc.kill())
    proc.stdout.on('error', err => done(execFailed(err)))

    // The request, piped rather than read: hq's half-close has to reach the
    // dev server as a half-close, or a client that signals "I am done sending"
    // by closing its write side hangs.
    stream.pipe(proc.stdin)

    // A `docker exec` that never runs — a daemon that has stopped answering,
    // a container removed between the lookup and here — produces neither a
    // byte nor an end, and the browser would wait on it indefinitely: the
    // zero-byte check below only fires when stdout ends, and the transport's
    // own timeout covers the accept alone. So the first byte has a deadline.
    //
    // It is the whole of the ready wait rather than something brisk, because
    // a dev server compiling for the first time can take that long to answer,
    // and it applies only until the FIRST byte: a response that has started
    // may take as long as it likes. What it would cut short is a request that
    // legitimately says nothing for a minute — a long poll of the person's
    // own making — which is the trade being made here.
    const firstByte = setTimeout(() => {
      done(new PreviewError('exec_failed', `${METHOD} got no answer from the dev server within ${FIRST_BYTE_TIMEOUT_MS}ms`))
    }, FIRST_BYTE_TIMEOUT_MS)
    firstByte.unref?.()

    proc.stdout.on('data', (chunk: Buffer) => {
      wrote += chunk.length
      clearTimeout(firstByte)
    })
    proc.stdout.pipe(stream, { end: false })
    proc.stdout.on('end', () => {
      if (wrote === 0) {
        // Not one byte: the relay could not reach the port, or docker refused
        // the exec. Ending cleanly here would reach hq as an empty response
        // and a bare socket hang up, with nothing in it for anyone to read.
        done(new PreviewError('exec_failed', `${METHOD} reached no dev server in that container`))
        return
      }
      // A close during this end is the natural finish of a relay rather than
      // a cancel, and `onStreamClose` resolving is what makes it read that way:
      // this transport's sends can complete synchronously, so hq's answer to
      // our `end` can close the stream before `end`'s own callback runs.
      stream.end(() => done())
    })
  })
}

function execFailed(err: unknown): PreviewError {
  return new PreviewError(
    'exec_failed',
    `${METHOD} lost the connection to the dev server: ${err instanceof Error ? err.message : String(err)}`,
  )
}
