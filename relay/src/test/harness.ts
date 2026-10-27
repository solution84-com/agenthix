/** A relay on an ephemeral 127.0.0.1 port, with hq's keys given directly, and a way to ask it as a browser would. */
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { JsonWebKeySet } from '@agenthix/core'
import { KeySet } from '../keySet'
import { createRelay, type RelayParts } from '../relay'
import { makeSigner, type Signer } from './signer'

export const FILES_HOST = 'files.example.com'
export const APP_ORIGIN = 'https://hq.example.com'
export const APP_HOST = 'hq.example.com'

export type Harness = Awaited<ReturnType<typeof startRelay>>

export async function startRelay(
  over: Partial<RelayParts> = {}, signer: Signer = makeSigner(), keySource: () => JsonWebKeySet = () => signer.keys,
  clock: () => number = Date.now,
) {
  const logs: string[] = []
  let relayId: string | null = 'relay-1'
  let fetches = 0
  const keys = new KeySet(async () => {
    fetches++
    return keySource()
  }, clock)
  const relay = createRelay({
    keys, relayId: () => relayId, filesHost: FILES_HOST, appOrigin: APP_ORIGIN, log: line => logs.push(line), ...over,
  })
  await new Promise<void>(resolve => relay.server.listen(0, '127.0.0.1', resolve))
  const port = (relay.server.address() as AddressInfo).port
  return {
    ...relay, port, signer, logs, keys,
    get fetches() { return fetches },
    setRelayId(id: string | null) { relayId = id },
    close: () => new Promise<void>(resolve => {
      relay.server.closeAllConnections()
      relay.server.close(() => resolve())
    }),
  }
}

export type Answer = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }

export function ask(
  port: number, path: string,
  o: { method?: string; host?: string; headers?: Record<string, string>; abortAfterBytes?: number } = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, path, method: o.method ?? 'GET',
      headers: { Host: o.host ?? FILES_HOST, ...o.headers },
    }, res => {
      const chunks: Buffer[] = []
      let got = 0
      res.on('data', (c: Buffer) => {
        chunks.push(c)
        got += c.length
        if (o.abortAfterBytes !== undefined && got >= o.abortAfterBytes) {
          req.destroy()
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
        }
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

export const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise(r => setTimeout(r, 10))
  }
}
