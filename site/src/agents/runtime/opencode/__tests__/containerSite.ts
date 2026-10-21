/**
 * The site's end of `container/standin-site-tunnel.mjs`, for the OpenCode
 * container checks. It serves the site's own turn, gate and model relay
 * handlers over real HTTP on this machine's loopback address, mounted as
 * `main.ts` mounts them — the turn and gate behind the JSON body parser, the
 * relay with none — and carries each tunnelled request to
 * that server and its answer back, streaming both ways. Every answer's status
 * is recorded in `calls`, and the turn's and the gate's bodies with it.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import readline from 'node:readline'
import express from 'express'
import { HARNESS_GATE_PATH, HARNESS_TURN_PATH } from '@agenthix/core'
import { harnessTurnHandler } from '../../../../server/harness/turnApi'
import { harnessGateHandler } from '../../../../server/harness/harnessGateApi'
import { modelRelayHandler } from '../../../../server/modelRelay/modelRelayApi'

export type SiteCall = { url: string; status: number; body: unknown }

type Frame =
  | { id: number; t: 'req'; method: string; url: string; headers: http.IncomingHttpHeaders }
  | { id: number; t: 'data'; b64: string }
  | { id: number; t: 'end' | 'abort' }

function siteApp(calls: SiteCall[]): express.Express {
  const app = express()
  const recorded = (handler: typeof harnessTurnHandler | typeof harnessGateHandler): express.RequestHandler => (req, res, next) => {
    const json = res.json.bind(res)
    res.json = body => {
      calls.push({ url: req.originalUrl, status: res.statusCode, body })
      return json(body)
    }
    Promise.resolve(handler(req, res)).catch(next)
  }
  app.post(HARNESS_TURN_PATH, express.json(), recorded(harnessTurnHandler))
  app.post(HARNESS_GATE_PATH, express.json(), recorded(harnessGateHandler))
  app.all('/api/v1/model-relay/:provider{/*rest}', (req, res, next) => {
    res.on('finish', () => calls.push({ url: req.originalUrl, status: res.statusCode, body: null }))
    Promise.resolve(modelRelayHandler(req, res)).catch(next)
  })
  return app
}

export type ServedSite = { tunnel: ChildProcess; close(): Promise<void> }

export async function serveSite(containerName: string, calls: SiteCall[]): Promise<ServedSite> {
  const server = http.createServer(siteApp(calls))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port

  const tunnel = spawn('docker', ['exec', '-i', containerName, 'node', '/standin/standin-site-tunnel.mjs'], { stdio: ['pipe', 'pipe', 'ignore'] })
  const send = (frame: Record<string, unknown>) => { if (tunnel.stdin!.writable) tunnel.stdin!.write(JSON.stringify(frame) + '\n') }
  const requests = new Map<number, http.ClientRequest>()

  readline.createInterface({ input: tunnel.stdout! }).on('line', line => {
    const frame = JSON.parse(line) as Frame
    if (frame.t === 'req') {
      const request = http.request({ host: '127.0.0.1', port, method: frame.method, path: frame.url, headers: frame.headers }, answer => {
        send({ id: frame.id, t: 'res', status: answer.statusCode, headers: answer.headers })
        answer.on('data', (chunk: Buffer) => send({ id: frame.id, t: 'data', b64: chunk.toString('base64') }))
        answer.on('end', () => { requests.delete(frame.id); send({ id: frame.id, t: 'end' }) })
        answer.on('error', () => { requests.delete(frame.id); send({ id: frame.id, t: 'error' }) })
      })
      request.on('error', () => { requests.delete(frame.id); send({ id: frame.id, t: 'error' }) })
      requests.set(frame.id, request)
    } else if (frame.t === 'data') {
      requests.get(frame.id)?.write(Buffer.from(frame.b64, 'base64'))
    } else if (frame.t === 'end') {
      requests.get(frame.id)?.end()
    } else if (frame.t === 'abort') {
      requests.get(frame.id)?.destroy()
      requests.delete(frame.id)
    }
  })

  return {
    tunnel,
    close: async () => {
      tunnel.kill()
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    },
  }
}
