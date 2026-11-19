/** Fakes the light model's playground tests share: a model that answers each listening call from a script. */
import type { LeadRequest, ModelAdapter, ResolvedAccess, TurnUsage } from '../../../../contract'

export const ACCESS: ResolvedAccess = { providerId: 'p1', providerName: 'Test', provider: 'openrouter', model: 'flash', apiKey: 'fake' }
export const USAGE: TurnUsage = { inputTokens: 1200, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 }

export type Answer = string | { delayMs: number; text: string } | Error

/** Answers each call by the first rule whose pattern the call's user message matches; keep_listening otherwise. */
export function scriptedModel(rules: [RegExp, Answer][]): Pick<ModelAdapter, 'complete'> & { requests: Omit<LeadRequest, 'tools'>[] } {
  const requests: Omit<LeadRequest, 'tools'>[] = []
  return {
    requests,
    async complete(request) {
      requests.push(request)
      const user = userText(request)
      const answer = rules.find(([re]) => re.test(user))?.[1] ?? '{"action":"keep_listening","next_check":2}'
      if (answer instanceof Error) throw answer
      const { delayMs, text } = typeof answer === 'string' ? { delayMs: 0, text: answer } : answer
      if (delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delayMs)
          request.signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
        })
      }
      return { text, usage: USAGE }
    },
  }
}

/** The call's one user message. */
export function userText(request: Pick<LeadRequest, 'messages'>): string {
  const m = request.messages[0]
  return m && 'content' in m ? m.content : ''
}

export const json = (o: Record<string, unknown>) => JSON.stringify(o)
