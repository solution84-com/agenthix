/**
 * One turn in an OpenCode session (spec §8): the message is sent with the
 * turn's model, agent and system prompt, and the session's events are
 * translated until OpenCode says the session is idle.
 *
 * The message goes by `prompt_async`, which answers at once, so no request
 * waits on a model; the turn's end comes from the event stream. The session's
 * events are routed to this turn before the message is sent, so none is missed.
 *
 * A cancel aborts OpenCode's session (`POST /session/:id/abort`). The site has
 * already stopped the run's gate decisions by then (AgentEngine.cancelRun),
 * so nothing the gate was still deciding can run after the abort. A turn that
 * gives up on OpenCode's retries (openCodeTranslate.ts) is ended the same way,
 * its gate decisions first.
 *
 * A Summarise now turn sends no message: it asks the session to summarise
 * itself (`POST /session/:id/summarize`, as OpenCode's own `/compact` does),
 * and ends, like any turn, when the session is idle. Every turn ends saying how
 * full the session's memory is, when OpenCode reported its tokens.
 */
import { Logger } from '../../../server/utils/logger'
import type { RunContext, RunEvent } from '../types'
import type { OpenCodeServers } from './openCodeServers'
import type { OpenCodeModel } from './openCodeConfig'
import { OpenCodeTurnTranslator } from './openCodeTranslate'
import { directoryQuery } from './openCodeSessions'
import { stopGateRun } from '../toolGateRuns'
import { modelLimit, openCodeContextUse } from './openCodeContext'

const logger = new Logger('OpenCodeTurn')

/** The agent OpenCode runs every Agenthix agent as: its prompt, model and limits arrive per message and per session. */
export const OPENCODE_AGENT = 'build'

/** How long asking a session to summarise itself may take: it is a model call over the whole conversation. */
const SUMMARISE_TIMEOUT_MS = 10 * 60_000

/** A queue a callback pushes into and a generator drains. */
class EventQueue {
  private items: RunEvent[] = []
  private wake: (() => void) | null = null
  private closed = false

  push(...events: RunEvent[]): void {
    this.items.push(...events)
    this.wake?.()
  }

  close(): void {
    this.closed = true
    this.wake?.()
  }

  async *drain(): AsyncGenerator<RunEvent> {
    for (;;) {
      while (this.items.length > 0) yield this.items.shift()!
      if (this.closed) return
      await new Promise<void>(resolve => { this.wake = resolve })
      this.wake = null
    }
  }
}

export interface TurnInput {
  containerName: string
  openCodeSessionId: string
  connectionName: string
  model: OpenCodeModel
  context: RunContext
  system: string | undefined
}

export async function* runOpenCodeTurn(servers: OpenCodeServers, t: TurnInput): AsyncGenerator<RunEvent> {
  const { containerName, openCodeSessionId: id, context } = t
  const translator = new OpenCodeTurnTranslator(t.connectionName)
  const queue = new EventQueue()
  let stopped: string | undefined
  const where = directoryQuery(context.cwd)
  const unlisten = servers.listen(containerName, id, {
    onEvent: event => {
      const gaveUp = !!translator.gaveUp
      queue.push(...translator.translate(event))
      if (!gaveUp && translator.gaveUp) {
        logger.warn(`[opencode] run ${context.runId}: giving up on the provider: ${translator.gaveUp}`)
        stopGateRun(context.runId)
        abortSession()
        queue.close()
      }
      if (translator.done) queue.close()
    },
    onServerStopped: reason => {
      stopped = reason
      queue.close()
      // A server still running has lost only its stream: the turn is given up,
      // so it is ended there too — its gate decisions first, as on a cancel.
      if (servers.isRunning(containerName)) {
        stopGateRun(context.runId)
        abortSession()
      }
    },
  })
  const onAbort = () => {
    queue.close()
    abortSession()
  }
  function abortSession(): void {
    servers.request(containerName, 'POST', `/session/${encodeURIComponent(id)}/abort?${where}`, undefined, 10_000)
      .then(res => { if (res.status !== 200) logger.warn(`[opencode] run ${context.runId}: abort answered ${res.status} ${res.error ?? ''}`) })
      .catch(err => logger.warn(`[opencode] run ${context.runId}: abort failed: ${String(err)}`))
  }
  const signal = context.abortSignal
  try {
    if (signal?.aborted) {
      yield { type: 'status', status: 'cancelled', error: 'Cancelled' }
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const model = { providerID: t.model.providerID, modelID: t.model.modelID }
    const refused = (res: { status: number; error?: string; body?: string }) => res.status < 200 || res.status >= 300
      ? new Error(`OpenCode did not accept the message (${res.error ?? `status ${res.status}`}${res.body ? `: ${res.body.slice(0, 200)}` : ''})`)
      : null
    // `summarize` answers when the summary is done; its events arrive meanwhile, so it is not awaited before them.
    const summarising = context.summarise
      ? servers.request(containerName, 'POST', `/session/${encodeURIComponent(id)}/summarize?${where}`, { ...model, auto: false }, SUMMARISE_TIMEOUT_MS)
        .catch((err: unknown) => ({ status: 0, body: '', error: String(err) }))
      : null
    if (!summarising) {
      const sent = refused(await servers.request(containerName, 'POST', `/session/${encodeURIComponent(id)}/prompt_async?${where}`, {
        model,
        agent: OPENCODE_AGENT,
        ...(t.system ? { system: t.system } : {}),
        parts: [{ type: 'text', text: context.prompt }],
      }))
      if (sent) throw sent
    }
    yield* queue.drain()
    if (signal?.aborted) {
      yield { type: 'status', status: 'cancelled', error: 'Cancelled' }
      return
    }
    if (summarising) {
      const failed = refused(await summarising)
      if (failed) throw failed
    }
    const tokens = translator.contextTokens
    const limit = tokens !== null ? await modelLimit(servers, containerName, t.model, where) : null
    if (tokens !== null && limit) yield { type: 'context_use', use: openCodeContextUse(tokens, limit, new Date()) }
    yield translator.finish(stopped)
  } finally {
    signal?.removeEventListener('abort', onAbort)
    unlisten()
  }
}
