/**
 * hq's opener mux wired straight to a site server mux, no socket — the harness
 * `packages/__tests__/packageMethods.test.ts` established. It exercises the
 * real framing, chunking and half-close logic in core's `StreamMux` while
 * keeping a test to one process. Shared by the content read tests.
 */
import {
  StreamMux,
  LOCATION_FILE_METHODS,
  type StreamEvents,
} from '@agenthix/core'
import { ContentStream } from '../contentStream'
import type { ContentHandler } from '../contentMethods'
import { handleLocationRead } from '../locationReadHandler'

/** hq's opener mux wired straight to a site server mux, serving one handler.
 *  `onServed` runs SYNCHRONOUSLY after the handler is invoked and before any
 *  of its awaits have resolved — which is the window an early cancel lands in. */
export function openRead(
  params: unknown,
  onServed?: (stream: ContentStream) => void,
  onHqData?: (served: ContentStream) => void,
  handler: ContentHandler = handleLocationRead,
  method: string = LOCATION_FILE_METHODS.readFile,
) {
  let site!: StreamMux
  const hq = new StreamMux('opener', { sendText: t => site.receiveText(t), sendBinary: async b => site.receiveBinary(b) })
  site = new StreamMux('server', { sendText: t => hq.receiveText(t), sendBinary: async b => hq.receiveBinary(b) })

  let resolveEnd!: () => void
  let rejectErr!: (e: string) => void
  const outcome = new Promise<void>((res, rej) => { resolveEnd = res; rejectErr = rej })
  // Every rejection this harness creates gets a handler, here, at the moment
  // it is created. A test that awaits `outcome` still sees the rejection; a
  // test that only awaits `handled()` no longer leaves an unobserved one to
  // fail the whole run. Suppressing the warning globally would have hidden
  // the next real one too.
  void outcome.catch(() => {})

  const chunks: Buffer[] = []
  const frameSizes: number[] = []
  let served: ContentStream | null = null
  let handlerSettled: 'resolved' | 'rejected' | null = null
  let handled: Promise<void> = Promise.resolve()
  let failure: Error | null = null

  site.onOpen = (id, _method, p) => {
    const { stream, events } = ContentStream.attach(site, id)
    site.accept(id, events)
    served = stream
    handled = handler(stream, p)
      .then(() => { handlerSettled = 'resolved' })
      .catch(err => {
        handlerSettled = 'rejected'
        failure = err instanceof Error ? err : new Error('Handler failed')
        if (!stream.destroyed) {
          site.fail(id, 'handler_failed', failure.message)
          stream.destroy()
        }
      })
    onServed?.(stream)
  }

  const events: StreamEvents = {
    onAccept() {},
    onData: payload => {
      frameSizes.push(payload.byteLength)
      chunks.push(Buffer.from(payload))
      if (served) onHqData?.(served)
    },
    onEnd: () => resolveEnd(),
    onError: (code, message) => rejectErr(`${code}: ${message}`),
  }
  const id = hq.open(method, params, events)
  return {
    id,
    outcome,
    frameSizes,
    body: () => Buffer.concat(chunks),
    writableEnded: () => served?.writableEnded ?? false,
    handlerSettled: () => handlerSettled,
    /** Settles when the HANDLER settles, whatever hq did or did not see. */
    handled: () => handled,
    failure: () => failure,
  }
}

