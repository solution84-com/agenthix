/**
 * The platform tools the site serves itself (5.14, 5.42): `stop_processes`
 * for the calling conversation's own processes, and `web_search` on OpenCode
 * with the org's key. No process is signalled and Exa is never called: the
 * stop and the search service are stand-ins.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ stop: vi.fn() }))
vi.mock('../../../agents/runtime/conversationProcessStop', () => ({ stopConversationProcesses: h.stop, STOP_PROCESSES_MATCH_MAX: 200 }))

import { registerSiteTools } from '../siteTools'
import type { SiteToolsOptions } from '../siteTools'
import { exaWebSearch, EXA_SEARCH_URL, WebSearchError } from '../../search/webSearch'
import type { WebSearchService } from '../../search/webSearch'
import type { RunContext } from '../../../agents/runtime/types'

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: true }>

function serve(opts: SiteToolsOptions): Map<string, Handler> {
  const tools = new Map<string, Handler>()
  const server = { tool: (...args: unknown[]) => { tools.set(args[0] as string, args[args.length - 1] as Handler) } }
  registerSiteTools(server as never, opts)
  return tools
}

const KEY = 'exa-secret-key-123'
const turn = (over: Partial<RunContext> = {}) =>
  ({ runId: 'run-1', sessionId: 'conv-1', containerName: 'agent-c1', webSearchKey: KEY, ...over }) as RunContext

beforeEach(() => vi.clearAllMocks())

describe('stop_processes', () => {
  it('stops the calling conversation\'s own processes in its own container, by the text given', async () => {
    h.stop.mockResolvedValue({ kind: 'stopped', stopped: [{ pid: 20, command: 'npm run dev' }, { pid: 21, command: 'node vite' }] })
    const r = await serve({ context: turn(), openCode: false }).get('stop_processes')!({ match: 'npm run dev' })
    expect(h.stop).toHaveBeenCalledWith('agent-c1', 'conv-1', 'npm run dev')
    expect(r).toEqual({ content: [{ type: 'text', text: 'Stopped 2:\n20 npm run dev\n21 node vite' }] })
  })

  it('takes the conversation from the turn the token acts for, never from its arguments', async () => {
    h.stop.mockResolvedValue({ kind: 'stopped', stopped: [] })
    await serve({ context: turn(), openCode: true }).get('stop_processes')!({ match: 'x', sessionId: 'conv-2', containerName: 'other' })
    expect(h.stop).toHaveBeenCalledWith('agent-c1', 'conv-1', 'x')
  })

  it('stops every process of the conversation when no text is given, and says when none matched', async () => {
    h.stop.mockResolvedValue({ kind: 'stopped', stopped: [] })
    const r = await serve({ context: turn(), openCode: false }).get('stop_processes')!({})
    expect(h.stop).toHaveBeenCalledWith('agent-c1', 'conv-1', '')
    expect(r.content[0].text).toBe('No process of this conversation matched.')
  })

  it('does nothing with no turn running or no container, and reports a failure as an error', async () => {
    expect((await serve({ context: null, openCode: false }).get('stop_processes')!({})).isError).toBe(true)
    expect((await serve({ context: turn({ containerName: undefined }), openCode: false }).get('stop_processes')!({})).isError).toBe(true)
    expect(h.stop).not.toHaveBeenCalled()
    h.stop.mockResolvedValue({ kind: 'failed', error: 'docker exec timed out' })
    const r = await serve({ context: turn(), openCode: false }).get('stop_processes')!({})
    expect(r).toEqual({ content: [{ type: 'text', text: 'The processes could not be stopped: docker exec timed out' }], isError: true })
  })
})

describe('web_search', () => {
  const results = [{ title: 'Result', url: 'https://example.com/a', publishedDate: '2026-09-01T00:00:00Z', text: 'Some  text\nhere' }]

  it('is offered to OpenCode only; Claude keeps its own', () => {
    expect(serve({ context: turn(), openCode: false }).has('web_search')).toBe(false)
    expect(serve({ context: turn(), openCode: true }).has('web_search')).toBe(true)
  })

  it('searches with the turn\'s key, and the key never appears in what the model gets', async () => {
    const search = vi.fn<WebSearchService['search']>().mockResolvedValue(results)
    const r = await serve({ context: turn(), openCode: true, webSearch: { search } }).get('web_search')!({ query: 'agenthix' })
    expect(search).toHaveBeenCalledWith({ query: 'agenthix', numResults: 5 }, KEY)
    expect(r.content[0].text).toBe('1. Result\n   https://example.com/a (2026-09-01)\n   Some text here')
    expect(JSON.stringify(r)).not.toContain(KEY)
  })

  it('says so when the org has no key, and calls nothing @SC-2155', async () => {
    const search = vi.fn<WebSearchService['search']>()
    const r = await serve({ context: turn({ webSearchKey: undefined }), openCode: true, webSearch: { search } }).get('web_search')!({ query: 'q' })
    expect(r).toEqual({ content: [{ type: 'text', text: 'Web search is not set up for this organisation: it has no search key.' }], isError: true })
    expect(search).not.toHaveBeenCalled()
  })

  it('reports the service failing, without its detail or the key', async () => {
    const search = vi.fn<WebSearchService['search']>().mockRejectedValue(new Error(`boom ${KEY}`))
    const r = await serve({ context: turn(), openCode: true, webSearch: { search } }).get('web_search')!({ query: 'q' })
    expect(r).toEqual({ content: [{ type: 'text', text: 'The search failed.' }], isError: true })
    search.mockRejectedValue(new WebSearchError('The search service answered 429.'))
    expect((await serve({ context: turn(), openCode: true, webSearch: { search } }).get('web_search')!({ query: 'q' })).content[0].text)
      .toBe('The search service answered 429.')
  })
})

describe('Exa\'s Search API, behind the service interface', () => {
  it('sends the key in its header only, and reads the results', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [...results(), { title: 'no url' }] }), { status: 200 }))
    const found = await exaWebSearch(fetchImpl).search({ query: 'q', numResults: 3 }, KEY)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(EXA_SEARCH_URL)
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY)
    expect(JSON.parse(init.body as string)).toEqual(expect.objectContaining({ query: 'q', numResults: 3 }))
    expect(init.body).not.toContain(KEY)
    expect(found).toEqual([{ title: 'Result', url: 'https://example.com/a', publishedDate: undefined, text: 'x' }])
  })

  it('turns a refusal, a network failure or a malformed answer into an error without the key', async () => {
    const svc = (res: () => Promise<Response>) => exaWebSearch(vi.fn().mockImplementation(res))
    const failures = [
      svc(async () => new Response('nope', { status: 401 })),
      svc(async () => { throw new TypeError(`fetch failed ${KEY}`) }),
      svc(async () => new Response('not json', { status: 200 })),
      svc(async () => new Response('{}', { status: 200 })),
    ]
    for (const s of failures) {
      const err = await s.search({ query: 'q', numResults: 1 }, KEY).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(WebSearchError)
      expect((err as Error).message).not.toContain(KEY)
    }
  })

  function results() { return [{ title: 'Result', url: 'https://example.com/a', text: 'x' }] }
})
