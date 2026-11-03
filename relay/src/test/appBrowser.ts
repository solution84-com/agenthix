/** A browser's requests to a live app's address at the relay, with the fetch metadata a browser sends. */
import { request } from 'node:http'
import { APP_ENTRY_FIELD, APP_ENTRY_PATH } from '@agenthix/core'
import { APP_ORIGIN, type Answer } from './harness'
import { appHost, appOrigin } from './appSite'

export const SAME_ORIGIN = { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' }
export const OWN_PAGE = { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' }

export function send(
  port: number, path: string,
  o: { method?: string; host?: string; headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, path, method: o.method ?? 'GET', headers: { Host: o.host ?? appHost(), ...o.headers },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
      res.on('end', done)
      res.on('error', done)
      res.on('aborted', done)
    })
    req.on('error', reject)
    req.end(o.body)
  })
}

/** hq's page entering with a ticket: a form `POST` from hq's origin, into hq's viewer frame unless said otherwise. */
export function enter(port: number, ticket: string, o: { origin?: string; dest?: string; host?: string } = {}): Promise<Answer> {
  return send(port, APP_ENTRY_PATH, {
    method: 'POST',
    host: o.host,
    headers: {
      Origin: o.origin ?? APP_ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded',
      'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': o.dest ?? 'iframe',
    },
    body: new URLSearchParams({ [APP_ENTRY_FIELD]: ticket }).toString(),
  })
}

/** The `name=value` of the cookie the relay set, as the browser sends it back. */
export function cookieOf(answer: Answer): string {
  const set = answer.headers['set-cookie']
  const first = Array.isArray(set) ? set[0] : set
  return (first ?? '').split(';')[0]
}

export { appOrigin }
