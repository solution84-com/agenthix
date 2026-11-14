import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'

/**
 * No test calls a model, voice or search provider: they cost money and carry keys, so a test replaces them with a fake.
 * Matches a host or any subdomain of one. A local stand-in (localhost, 127.0.0.1) is never matched.
 */
export const PROVIDER_HOSTS = [
  'anthropic.com',
  'openai.com',
  'openrouter.ai',
  'assemblyai.com',
  'inworld.ai',
  'generativelanguage.googleapis.com',
  'exa.ai',
]

export function providerHostOf(target: unknown): string | null {
  let host: string | undefined
  try {
    if (typeof target === 'string') host = new URL(target).hostname
    else if (target instanceof URL) host = target.hostname
    else if (target && typeof target === 'object') {
      const t = target as { url?: string; hostname?: string; host?: string }
      host = t.url ? new URL(t.url).hostname : (t.hostname ?? t.host)?.replace(/:\d+$/, '')
    }
  } catch { return null }
  host = host?.toLowerCase()
  return host && PROVIDER_HOSTS.find((p) => host === p || host.endsWith(`.${p}`)) ? host : null
}

export const refusal = (host: string, test: string) =>
  `Test "${test}" made an outbound request to ${host}, a model, voice or search provider. Replace the call with a fake.`

/** Wraps fetch and http(s).request/get on the given objects; returns the hosts reached and a way to undo it. */
export function installProviderGuard(
  currentTest: () => string,
  scope: { fetch?: typeof fetch; http: typeof http; https: typeof https } = { fetch: globalThis.fetch, http, https },
) {
  const reached: string[] = []
  const hit = (target: unknown) => {
    const host = providerHostOf(target)
    if (!host) return
    const message = refusal(host, currentTest())
    reached.push(message)
    throw new Error(message)
  }
  const originals = { http: { request: scope.http.request, get: scope.http.get }, https: { request: scope.https.request, get: scope.https.get } }
  const originalFetch = scope.fetch
  const wrapped: typeof fetch = async (input, init) => {
    hit(input instanceof Request ? input.url : input)
    return originalFetch!(input, init)
  }
  if (originalFetch) globalThis.fetch = wrapped
  for (const [name, mod] of [['http', scope.http], ['https', scope.https]] as const) {
    for (const fn of ['request', 'get'] as const) {
      const original = originals[name][fn] as (...a: unknown[]) => unknown
      ;(mod as unknown as Record<string, unknown>)[fn] = (...args: unknown[]) => {
        const first = args[0]
        const second = args[1]
        // request(url, options) and request(options): the host may be on either.
        hit(first)
        if (typeof first === 'string' || first instanceof URL) hit(second)
        return original.apply(mod, args)
      }
    }
  }
  syncBuiltinESMExports()
  return {
    reached,
    restore() {
      if (originalFetch) globalThis.fetch = originalFetch
      Object.assign(scope.http, originals.http)
      Object.assign(scope.https, originals.https)
      syncBuiltinESMExports()
    },
  }
}
