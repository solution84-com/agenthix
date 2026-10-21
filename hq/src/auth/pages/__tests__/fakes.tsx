// Shared by the way-in page tests: the organisation as the public read and the link reads answer.
export const ACME = { name: 'Acme Corp', handle: 'acmecorp', vision: 'Software that helps small shops sell online.', avatarUrl: null, coverUrl: null }

type Answer = { status?: number; body: unknown }

/** Replaces fetch: each path answers with what the test says; a path not listed answers 404. */
export function fakeFetch(answers: Record<string, Answer | ((init?: RequestInit) => Answer)>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const a = answers[url]
    const { status = 200, body } = typeof a === 'function' ? a(init) : a ?? { status: 404, body: {} }
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  }) as typeof fetch
  return calls
}
