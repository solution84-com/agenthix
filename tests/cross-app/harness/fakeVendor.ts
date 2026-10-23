// A stand-in model vendor on a local port, so no test ever calls a real one. It speaks the OpenAI-compatible API,
// the one a provider with an address of its own (`openai_compatible`) is reached in: the site's relay sends a
// built-in vendor's calls only to that vendor's own address, never to one a test could choose.
//
// - `GET /v1/models`: what hq's key check reads when the provider is added (hq/src/providers/checks.ts).
// - `POST /v1/chat/completions`: a streamed answer whose last event carries the call's usage, as the vendor sends it
//   when asked for `stream_options.include_usage`.
//
// Every request is kept, so a test can see what reached the vendor: which key, and which model.
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const FAKE_KEY = 'sk-test-fake-cross-app'
export const FAKE_MODEL = 'fake-model-1'

/** What one answer reports: 120 prompt tokens, 20 of them read from the cache, and 34 written. */
export const FAKE_USAGE = { prompt_tokens: 120, completion_tokens: 34, prompt_tokens_details: { cached_tokens: 20 } }

export type SeenRequest = { method: string; path: string; authorization: string | null; body: string }

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

export class FakeVendor {
  readonly seen: SeenRequest[] = []
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
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.write(chunk(id, { role: 'assistant', content: '' }, null))
        res.write(chunk(id, { content: 'Hello from the stand-in vendor.' }, null))
        res.write(chunk(id, {}, 'stop'))
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: FAKE_MODEL, choices: [], usage: FAKE_USAGE })}\n\n`)
        res.end('data: [DONE]\n\n')
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
