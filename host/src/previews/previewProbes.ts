/**
 * What the preview address's checks ask of the machine: where a name resolves, and what this machine's port 443
 * answers for the check name. The host service runs on the machine's own network, so both are the machine's view.
 * Tests stand in fakes.
 */
import dns from 'node:dns'
import https from 'node:https'
import { PREVIEW_CHECK_ANSWER } from '@agenthix/core'

export type PreviewProbes = {
  /** Every address `host` resolves to; empty when it resolves to none. */
  resolve: (host: string) => Promise<string[]>
  /** Whether port 443 here answers `host` with the relay's own check answer, over a certificate a browser accepts. */
  checkAnswer: (host: string) => Promise<{ ok: true } | { ok: false; problem: string }>
}

const MAX_ANSWER_BYTES = 4096

/** `port`: the machine's 443, or a test's listener; `ca`: a test's own authority. */
export function checkAnswerProbe(port = 443, ca?: string): PreviewProbes['checkAnswer'] {
  return host => new Promise(resolve => {
    const req = https.request({
      host: '127.0.0.1', port, servername: host, path: '/', method: 'GET', headers: { Host: host }, timeout: 10_000, ...(ca ? { ca } : {}),
    }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        body += chunk
        if (body.length > MAX_ANSWER_BYTES) res.destroy()
      })
      res.on('end', () => resolve(res.statusCode === 200 && body === PREVIEW_CHECK_ANSWER
        ? { ok: true }
        : { ok: false, problem: res.statusCode === 200 ? 'something other than the relay answered it' : `it was answered ${res.statusCode}, not by the relay` }))
      res.on('error', err => resolve({ ok: false, problem: err.message }))
    })
    req.once('timeout', () => {
      req.destroy()
      resolve({ ok: false, problem: 'nothing answered on port 443' })
    })
    req.once('error', err => resolve({ ok: false, problem: err.message }))
    req.end()
  })
}

export async function resolveAll(host: string): Promise<string[]> {
  try {
    return (await dns.promises.lookup(host, { all: true })).map(a => a.address)
  } catch {
    return []
  }
}

export const machinePreviewProbes: PreviewProbes = { resolve: resolveAll, checkAnswer: checkAnswerProbe() }
