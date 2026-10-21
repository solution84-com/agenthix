/**
 * The Fleet Console following hq to a new address (host-management spec §13): told by hq, or pointed on its machine,
 * it dials the new address only once it passes the move check on its lasting credential.
 */
import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { MOVE_CHECK_PATH, MOVE_PROOF_PATH, type MoveChallenge, type MoveProof } from '@agenthix/core'
import {
  answerMoveChallenge, credentialHashOf, moveTagMatches, runMoveCheck, verifyMoveProof, type MoveCheckPost,
} from '@agenthix/core/host-crypto'
import { ConsoleAddressFollower } from '../hq/addressFollow'
import { HqCredentials } from '../hq/credentials'
import { WsHqLink } from '../hq/wsLink'
import { tempState, until } from './fakes'

const CREDENTIAL = 'fcc_' + 'ab'.repeat(30)
const OLD = 'http://192.168.1.20:4100'
const NEW = 'http://192.168.1.30:4100'

function hqAt(own: string, holds: string) {
  const sent: string[] = []
  const nonces = new Map<string, string>()
  const post: MoveCheckPost = async (url, body) => {
    const path = new URL(url).pathname
    sent.push(path)
    const hash = await credentialHashOf(holds)
    if (path === MOVE_CHECK_PATH) {
      const c = JSON.parse(body) as MoveChallenge
      if (!(await moveTagMatches(hash, c))) return { status: 403, text: JSON.stringify({ v: 1, refused: 'unknown' }) }
      const a = await answerMoveChallenge(hash, own, c)
      nonces.set(a.nonce, hash)
      return { status: 200, text: JSON.stringify(a) }
    }
    const p = JSON.parse(body) as MoveProof
    const ok = await verifyMoveProof(nonces.get(p.hqNonce) ?? hash, own, p)
    return { status: ok ? 200 : 403, text: JSON.stringify({ v: 1, ok }) }
  }
  return { post, sent }
}

function follower(post: MoveCheckPost, o: { onHqMachine?: boolean; configured?: string; state?: ReturnType<typeof tempState> } = {}) {
  const state = o.state ?? tempState()
  state.prepare()
  const redials: string[] = []
  const f = new ConsoleAddressFollower({
    state, configured: o.configured ?? OLD, onHqMachine: o.onHqMachine ?? false, credential: () => CREDENTIAL,
    redial: a => redials.push(a), check: c => runMoveCheck({ ...c, post }), later: () => () => {},
  })
  return { f, redials, state }
}

let cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanup) await c()
  cleanup = []
})

describe("the Fleet Console following hq's new address @SC-890", () => {
  it('keeps the old address until the new one passes the check, then dials it, across a restart', async () => {
    const hq = hqAt(NEW, CREDENTIAL)
    const { f, redials, state } = follower(hq.post)
    f.take(NEW)
    await until(() => f.moving()?.to === NEW)
    expect(f.current()).toBe(OLD)
    expect(await f.point()).toEqual({ address: NEW, outcome: 'passed' })
    expect(f.current()).toBe(NEW)
    expect(redials).toEqual([NEW])
    expect(f.moving()).toBeNull()
    expect(follower(hq.post, { state }).f.current()).toBe(NEW)
    expect(follower(hq.post, { state, configured: 'https://hq.acme.example' }).f.current()).toBe('https://hq.acme.example')
  })

  it('stays when the address fails the check, which hears nothing more', async () => {
    const stranger = hqAt(NEW, 'fcc_another')
    const { f, redials } = follower(stranger.post)
    expect(await f.point(NEW)).toEqual({ address: NEW, outcome: 'notThisHq' })
    expect(stranger.sent).toEqual([MOVE_CHECK_PATH])
    expect(f.current()).toBe(OLD)
    expect(redials).toEqual([])
    const relayed = hqAt('https://hq.acme.example', CREDENTIAL)
    expect((await follower(relayed.post).f.point(NEW))?.outcome).toBe('notThisHq')
  })

  it("takes no notice on hq's machine, and refuses an address it would send its credential to in the clear", async () => {
    const { f } = follower(hqAt(NEW, CREDENTIAL).post, { onHqMachine: true })
    f.take(NEW)
    expect(f.moving()).toBeNull()
    await expect(f.point(NEW)).rejects.toThrow(/hq's machine/)
    await expect(follower(hqAt(NEW, CREDENTIAL).post).f.point('http://hq.acme.example')).rejects.toThrow(/unencrypted/)
  })

  it('hears the new address on the console link, and redials where it is told', async () => {
    const server = http.createServer()
    const wss = new WebSocketServer({ server })
    const paths: string[] = []
    wss.on('connection', (ws, req) => {
      paths.push(req.url ?? '')
      if (paths.length === 1) ws.send(JSON.stringify({ version: '1.0', type: 'hq.address', payload: { address: NEW } }))
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const link = new WsHqLink({ url: `ws://127.0.0.1:${port}/console-link`, credentials: new HqCredentials(tempState(), 'pairing-secret-0123456789', null), log: () => {} })
    cleanup.push(async () => link.stop(), () => new Promise<void>(r => { for (const c of wss.clients) c.terminate(); server.close(() => r()) }))
    const heard: unknown[] = []
    link.on('hqAddress', a => heard.push(a))
    link.start()
    await until(() => heard.length === 1)
    expect(heard).toEqual([NEW])
    link.redial(`ws://127.0.0.1:${port}/console-link?moved`)
    await until(() => paths.length === 2, 10_000)
    expect(paths[1]).toBe('/console-link?moved')
  })
})
