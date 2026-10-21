/**
 * An hq's move check on a real port, for the host service's tests: it answers only for the credentials it holds,
 * at the address it says it is (its own, unless told another), and records every request it gets.
 */
import http from 'node:http'
import { MOVE_CHECK_PATH, MOVE_PROOF_PATH, type MoveChallenge, type MoveProof } from '@agenthix/core'
import { answerMoveChallenge, credentialHashOf, moveTagMatches, verifyMoveProof } from '@agenthix/core/host-crypto'

export type HqStandIn = { address: string; requests: { path: string; body: string }[]; close: () => Promise<void> }

export async function hqStandIn(credentials: string[], claims?: string): Promise<HqStandIn> {
  const hashes = await Promise.all(credentials.map(credentialHashOf))
  const requests: HqStandIn['requests'] = []
  const issued = new Map<string, string>()
  let own = ''
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', async () => {
      requests.push({ path: req.url ?? '', body })
      const reply = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
      try {
        if (req.url === MOVE_CHECK_PATH) {
          const challenge = JSON.parse(body) as MoveChallenge
          for (const hash of hashes) {
            if (!(await moveTagMatches(hash, challenge))) continue
            const answer = await answerMoveChallenge(hash, claims ?? own, challenge)
            issued.set(answer.nonce, hash)
            return reply(200, answer)
          }
          return reply(403, { v: 1, refused: 'unknown' })
        }
        if (req.url === MOVE_PROOF_PATH) {
          const proof = JSON.parse(body) as MoveProof
          const hash = issued.get(proof.hqNonce)
          const ok = !!hash && (await verifyMoveProof(hash, claims ?? own, proof))
          return reply(ok ? 200 : 403, { v: 1, ok })
        }
        reply(404, {})
      } catch {
        reply(400, {})
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  own = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return { address: own, requests, close: () => new Promise(resolve => server.close(() => resolve())) }
}

/** An address on this machine where nothing answers. */
export async function nothingAt(): Promise<string> {
  const server = http.createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}
