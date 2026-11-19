/** A listening rig for tests: the light model answers from a script, everything else is recorded. */
import type { VoiceListenedEvent } from '@agenthix/core'
import type { LeadRequest, ResolvedAccess } from '../../../contract'
import { LISTENER_SETTINGS } from '../../listener'
import { createListening, type ListenPayload, type ListeningDeps, type ListeningSession } from '../listen'

const access = { provider: 'openrouter', model: '~deepseek/deepseek-flash-latest', providerId: 'p1' } as unknown as ResolvedAccess

export type Answer = string | ((req: Omit<LeadRequest, 'tools'>) => Promise<string>)

/** A listening rig: the light model answers from a script, everything else is recorded. */
export function rig(script: Answer[], opts: { enabled?: boolean; access?: ResolvedAccess | null; noClosing?: boolean } = {}) {
  const sent: VoiceListenedEvent[] = []
  const admitted: string[] = []
  const closed: { message: string; agentText: string }[] = []
  /** The agent messages a closed turn stored, by its turn. */
  const messages = new Map<string, string>()
  const spoken: { text: string; tone?: string }[] = []
  const stored: string[] = []
  const logs: string[] = []
  const timers: { ms: number; fn: () => void; cancelled: boolean }[] = []
  const requests: string[] = []
  let clock = 1_000
  let lines = 0
  const deps: ListeningDeps = {
    settings: LISTENER_SETTINGS,
    enabled: async () => opts.enabled ?? true,
    access: async () => (opts.access === undefined ? access : opts.access),
    model: {
      async complete(req) {
        requests.push((req.messages[0] as { content: string }).content)
        const next = script.shift()
        if (next === undefined) throw new Error('no answer scripted')
        const text = typeof next === 'string' ? next : await next(req)
        return { text, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } }
      },
    },
    context: async () => ({ agent: 'Ada', person: 'Sam', recap: 'Sam is planning a trip.', exchanges: [] }),
    admit: async (_s, text) => { admitted.push(text) },
    closeTurn: async (_s, turn) => {
      closed.push({ message: turn.message, agentText: turn.agentText })
      messages.set('turn-1', turn.agentText)
      return 'turn-1'
    },
    speak: (_s, text, tone) => {
      spoken.push(tone ? { text, tone } : { text })
      return `line-${++lines}`
    },
    speakStored: async (_s, avoid, pool = 'hold') => {
      if (pool === 'closing' && opts.noClosing) return null
      const texts = pool === 'closing' ? ["I'll be here when you're ready.", 'No rush, just say when.'] : ['Okay, bear with me.', 'One moment.']
      const text = texts.find(t => !avoid.includes(t))!
      stored.push(text)
      return { lineId: `line-${++lines}`, text }
    },
    send: (_s, e) => { sent.push(e) },
    now: () => clock,
    later: (ms, fn) => {
      const t = { ms, fn, cancelled: false }
      timers.push(t)
      return () => { t.cancelled = true }
    },
    log: line => { logs.push(line) },
  }
  const session: ListeningSession = { conversationId: 'c1', holderId: 'u1' }
  const listening = createListening(deps)
  const call = (p: Partial<ListenPayload> & Pick<ListenPayload, 'seq' | 'moment'>) =>
    listening.listen(session, { text: '', quietMs: 300, ...p })
  return { sent, admitted, closed, messages, spoken, stored, logs, timers, requests, session, call, listening, tick: (ms: number) => { clock += ms } }
}

export const json = (o: object) => JSON.stringify(o)
