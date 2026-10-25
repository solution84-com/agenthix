// A stand-in model vendor on a local port, so no test ever calls a real one. It speaks the OpenAI-compatible API,
// the one a provider with an address of its own (`openai_compatible`) is reached in: the site's relay sends a
// built-in vendor's calls only to that vendor's own address, never to one a test could choose.
//
// - `GET /v1/models`: what hq's key check reads when the provider is added (hq/src/providers/checks.ts).
// - `POST /v1/chat/completions`: a streamed answer whose last event carries the call's usage, as the vendor sends it
//   when asked for `stream_options.include_usage`.
//
// Every request is kept, so a test can see what reached the vendor: which key, and which model. A test that drives a
// conversation sets `script`: it is asked first for each chat request and may answer with a tool call, as a model
// asking for a tool does; a request it leaves (null) gets the fixed answer. A request that does not ask for a stream
// is answered whole, as the vendor answers one.
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const FAKE_KEY = 'sk-test-fake-cross-app'
export const FAKE_MODEL = 'fake-model-1'

/** What one answer reports: 120 prompt tokens, 20 of them read from the cache, and 34 written. */
export const FAKE_USAGE = { prompt_tokens: 120, completion_tokens: 34, prompt_tokens_details: { cached_tokens: 20 } }

export type SeenRequest = { method: string; path: string; authorization: string | null; body: string }

/** What a chat request carries that a script reads: its messages and the names of the tools it offers. */
export type ChatRequest = {
  stream?: boolean
  messages?: { role: string; content?: unknown; tool_call_id?: string }[]
  tools?: { type: string; function?: { name: string } }[]
}

/** A scripted answer: text, or one call of a tool with its arguments. */
export type ScriptedAnswer = { text: string } | { toolCall: { name: string; args: Record<string, unknown> } }

function bodyOf(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function chunk(id: string, delta: Record<string, unknown>, finish: string | null): string {
  return `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: FAKE_MODEL, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
}

const FIXED: ScriptedAnswer = { text: 'Hello from the stand-in vendor.' }

function streamed(id: string, answer: ScriptedAnswer): string {
  const events = [chunk(id, { role: 'assistant', content: '' }, null)]
  if ('text' in answer) {
    events.push(chunk(id, { content: answer.text }, null), chunk(id, {}, 'stop'))
  } else {
    const call = { index: 0, id: `call_${id}`, type: 'function', function: { name: answer.toolCall.name, arguments: JSON.stringify(answer.toolCall.args) } }
    events.push(chunk(id, { tool_calls: [call] }, null), chunk(id, {}, 'tool_calls'))
  }
  events.push(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: FAKE_MODEL, choices: [], usage: FAKE_USAGE })}\n\n`)
  return events.join('') + 'data: [DONE]\n\n'
}

function whole(id: string, answer: ScriptedAnswer): string {
  const message = 'text' in answer
    ? { role: 'assistant', content: answer.text }
    : { role: 'assistant', content: null, tool_calls: [{ id: `call_${id}`, type: 'function', function: { name: answer.toolCall.name, arguments: JSON.stringify(answer.toolCall.args) } }] }
  return JSON.stringify({
    id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: FAKE_MODEL,
    choices: [{ index: 0, message, finish_reason: 'text' in answer ? 'stop' : 'tool_calls' }], usage: FAKE_USAGE,
  })
}

export class FakeVendor {
  readonly seen: SeenRequest[] = []
  script: ((request: ChatRequest) => ScriptedAnswer | null) | null = null
  private constructor(private readonly server: Server, readonly baseUrl: string) {}

  static async start(): Promise<FakeVendor> {
    let vendor: FakeVendor | null = null
    const server = createServer(async (req, res) => {
      const body = await bodyOf(req)
      const path = (req.url ?? '').split('?')[0]
      vendor?.seen.push({ method: req.method ?? '', path, authorization: req.headers.authorization ?? null, body })
      if (req.headers.authorization !== `Bearer ${FAKE_KEY}`) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Incorrect API key provided.', type: 'invalid_request_error' } }))
        return
      }
      if (req.method === 'GET' && path === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ object: 'list', data: [{ id: FAKE_MODEL, object: 'model', owned_by: 'cross-app' }] }))
        return
      }
      if (req.method === 'POST' && path === '/v1/chat/completions') {
        const id = `chatcmpl-${vendor?.seen.length ?? 0}`
        let request: ChatRequest = {}
        try {
          request = JSON.parse(body) as ChatRequest
        } catch {
          // Not JSON: the fixed reply.
        }
        const answer = vendor?.script?.(request) ?? FIXED
        if (request.stream !== true) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(whole(id, answer))
        } else {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
          res.end(streamed(id, answer))
        }
        return
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: `No route ${req.method} ${path}` } }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    vendor = new FakeVendor(server, `http://127.0.0.1:${port}/v1`)
    return vendor
  }

  close(): Promise<void> {
    return new Promise(resolve => this.server.close(() => resolve()))
  }
}
