/**
 * The model relay's rules for what it passes on (spec §6): the path it may
 * append to an upstream, and which headers cross each way.
 */
import { describe, it, expect } from 'vitest'
import { ModelSniffer, downstreamResponseHeaders, relayTokenOf, relayedPath, upstreamRequestHeaders, upstreamUrl } from '../relayRequest'

const PREFIX = '/api/v1/model-relay/openai'

describe('the path below a provider @SC-1222', () => {
  it('keeps the path and query the provider SDK added', () => {
    expect(relayedPath(`${PREFIX}/chat/completions`, PREFIX)).toEqual({ path: '/chat/completions', query: '' })
    expect(relayedPath(`${PREFIX}/models/gemini-2.5-flash:streamGenerateContent?alt=sse`, PREFIX))
      .toEqual({ path: '/models/gemini-2.5-flash:streamGenerateContent', query: '?alt=sse' })
    expect(relayedPath(PREFIX, PREFIX)).toEqual({ path: '', query: '' })
  })

  it('refuses anything that could climb out of the upstream base', () => {
    for (const rest of ['/../admin', '/v1/..', '/%2e%2e/admin', '/%2E%2e/x', '/./x', '/a%2fb', '/a%2Fb', '/a%5cb', '/a\\b', 'x/y', '/a%00b', '/%zz']) {
      expect(relayedPath(`${PREFIX}${rest}`, PREFIX), rest).toBeNull()
    }
  })

  it('refuses a URL outside the prefix', () => {
    expect(relayedPath('/api/v1/model-relay/openrouter/chat', PREFIX)).toBeNull()
  })

  it('never leaves the upstream origin or its base path once joined', () => {
    expect(upstreamUrl('https://api.openai.com/v1', { path: '/chat/completions', query: '?a=1' })?.href).toBe('https://api.openai.com/v1/chat/completions?a=1')
    expect(upstreamUrl('https://api.anthropic.com', { path: '/v1/messages', query: '?beta=true' })?.href).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(upstreamUrl('http://llm:11434/v1', { path: '', query: '' })?.href).toBe('http://llm:11434/v1')
    expect(upstreamUrl('https://api.openai.com/v1', { path: '@evil.example/x', query: '' })).toBeNull()
    expect(upstreamUrl('https://api.openai.com/v1', { path: 'x', query: '' })).toBeNull()
  })
})

describe('the request headers the provider receives @SC-1223', () => {
  it('drops every credential the container sent and every hop-by-hop header, and sets the turn\'s key', () => {
    const out = upstreamRequestHeaders({
      authorization: 'Bearer agenthix-key-arrives-with-each-request',
      'x-api-key': 'placeholder',
      'x-goog-api-key': 'placeholder',
      'api-key': 'placeholder',
      'x-agenthix-turn': 'relay-token',
      'proxy-authorization': 'Basic x',
      cookie: 'a=b',
      host: 'site:4201',
      'x-forwarded-for': '10.0.0.1',
      connection: 'keep-alive, x-hop',
      'x-hop': 'gone',
      'keep-alive': 'timeout=5',
      'transfer-encoding': 'chunked',
      'content-type': 'application/json',
      'content-length': '42',
      'anthropic-beta': 'a,b',
      'anthropic-version': '2023-06-01',
      'x-session-affinity': 's1',
      'user-agent': 'opencode/1.18.32',
    }, { 'x-api-key': 'sk-ant-REAL' })
    expect(out).toEqual({
      'content-type': 'application/json',
      'content-length': '42',
      'anthropic-beta': 'a,b',
      'anthropic-version': '2023-06-01',
      'x-session-affinity': 's1',
      'user-agent': 'opencode/1.18.32',
      'x-api-key': 'sk-ant-REAL',
    })
  })

  it('passes the provider\'s answer headers back, retry-after and rate limits included, hop-by-hop ones not', () => {
    expect(downstreamResponseHeaders({
      'content-type': 'text/event-stream',
      'retry-after': '1',
      'x-ratelimit-remaining-requests': '0',
      'request-id': 'req_1',
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
    })).toEqual({
      'content-type': 'text/event-stream',
      'retry-after': '1',
      'x-ratelimit-remaining-requests': '0',
      'request-id': 'req_1',
    })
  })
})

describe('the relay token a request carries @SC-1226', () => {
  it("is the plugin's own header first, then Claude Code's key headers", () => {
    expect(relayTokenOf({ 'x-agenthix-turn': 'T', 'x-api-key': 'placeholder', authorization: 'Bearer placeholder' })).toBe('T')
    expect(relayTokenOf({ 'x-api-key': 'T', authorization: 'Bearer T' })).toBe('T')
    expect(relayTokenOf({ authorization: 'Bearer T' })).toBe('T')
    expect(relayTokenOf({ authorization: 'Basic T' })).toBe('')
    expect(relayTokenOf({})).toBe('')
  })
})

describe('the model named in the log line @SC-1225', () => {
  it('is read from the start of the body as it passes, across chunks', () => {
    const sniffer = new ModelSniffer('/chat/completions')
    sniffer.push(Buffer.from('{"mo'))
    sniffer.push(Buffer.from('del": "qwen/qwen3.8-27b:free", "messages": []}'))
    expect(sniffer.model).toBe('qwen/qwen3.8-27b:free')
  })

  it("is Google's from the path", () => {
    expect(new ModelSniffer('/models/gemini-2.5-flash:streamGenerateContent').model).toBe('gemini-2.5-flash')
  })

  it('gives up after the start of a body that names none', () => {
    const sniffer = new ModelSniffer('/x')
    sniffer.push(Buffer.alloc(20_000, 'a'))
    sniffer.push(Buffer.from('"model":"late"'))
    expect(sniffer.model).toBeNull()
  })
})
