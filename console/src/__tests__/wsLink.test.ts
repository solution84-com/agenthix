import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { HOST_PROTOCOL_VERSION, HOST_PROTOCOL_VERSION_HEADER } from '@agenthix/core'
import { HqCredentials } from '../hq/credentials'
import { WsHqLink } from '../hq/wsLink'
import { tempState, until } from './fakes'

/** A stand-in for hq's `/console-link`: records each connection's headers and lets the test answer. */
async function fakeHq(onConnection: (ws: WebSocket, headers: http.IncomingHttpHeaders) => void, refuse?: number, refuseHeaders = '') {
  const server = http.createServer()
  const wss = new WebSocketServer({ noServer: true })
  const seen: http.IncomingHttpHeaders[] = []
  server.on('upgrade', (req, socket, head) => {
    seen.push(req.headers)
    if (refuse) {
      socket.end(`HTTP/1.1 ${refuse} Refused\r\n${refuseHeaders}\r\n`)
      return
    }
    wss.handleUpgrade(req, socket, head, ws => onConnection(ws, req.headers))
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return {
    url: `ws://127.0.0.1:${port}/console-link`,
    seen,
    close: () => new Promise<void>(r => { for (const c of wss.clients) c.terminate(); server.close(() => r()) }),
  }
}

let cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const c of cleanup) await c()
  cleanup = []
})


/** What a new Fleet Console presents for its code: the lookup, never the code. */
const CODE_LOOKUP = 'c'.repeat(64)
const FRESH = { lookup: CODE_LOOKUP, kind: 'fresh' as const }
const HANDOVER = { lookup: CODE_LOOKUP, kind: 'handover' as const }

describe('the console link @SC-891', () => {
  it('presents the pairing secret, and pairs answers with requests', async () => {
    const hq = await fakeHq(ws => {
      ws.on('message', raw => {
        const frame = JSON.parse(raw.toString())
        if (frame.type === 'console.request') {
          ws.send(JSON.stringify({ version: '1.0', type: 'console.response', replyTo: frame.requestId, payload: { hosts: [] } }))
        }
      })
    })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), 'pairing-secret-0123456789', null), log: () => {} })
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => link.state === 'connected')
    expect(hq.seen[0].authorization).toBe('Bearer pairing-secret-0123456789')
    await expect(link.call('host.list', {})).resolves.toEqual({ hosts: [] })
  })

  it('tells hq on its first connection that it has just started, and on a reconnection that it has not', async () => {
    const hellos: unknown[] = []
    const hq = await fakeHq(ws => {
      ws.on('message', raw => {
        const frame = JSON.parse(raw.toString())
        if (frame.type === 'console.hello') hellos.push(frame.payload)
      })
    })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), 'pairing-secret-0123456789', null), log: () => {} })
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => hellos.length === 1)
    // A moment's loss of the connection: the same Fleet Console, which still holds its joins.
    link.redial(hq.url)
    await until(() => hellos.length === 2)
    expect(hellos).toEqual([{ started: true }, { started: false }])
  })

  it('redeems a one-time code once, by its lookup, keeps the credential, and presents it from then on', async () => {
    const state = tempState()
    state.prepare()
    let connections = 0
    const hq = await fakeHq(ws => {
      connections++
      if (connections === 1) ws.send(JSON.stringify({ version: '1.0', type: 'console.credential', payload: { credential: 'fcc_lasting-credential-abcdef' } }))
    })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(state, null, FRESH), log: () => {} })
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => link.state === 'connected')
    expect(hq.seen[0]['x-console-code']).toBe(CODE_LOOKUP)
    expect(hq.seen[0].authorization).toBeUndefined()
    expect(state.readText('hq-credential')).toBe('fcc_lasting-credential-abcdef')
    expect(new HqCredentials(state, null, FRESH).current()).toEqual({ kind: 'bearer', value: 'fcc_lasting-credential-abcdef' })
  })

  it('prefers a lasting credential to the pairing secret, which hq refuses once a code was redeemed', () => {
    const state = tempState()
    state.prepare()
    expect(new HqCredentials(state, 'pairing-secret-0123456789', null).current()).toEqual({ kind: 'bearer', value: 'pairing-secret-0123456789' })
    new HqCredentials(state, null, null).saveRedeemed('fcc_lasting-credential-abcdef')
    expect(new HqCredentials(state, 'pairing-secret-0123456789', null).current()).toEqual({ kind: 'bearer', value: 'fcc_lasting-credential-abcdef' })
  })

  it('is not usable on a code connection until hq has sent the credential', async () => {
    const hq = await fakeHq(() => {})
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), null, FRESH), log: () => {} })
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => hq.seen.length === 1)
    await new Promise(r => setTimeout(r, 30))
    expect(link.state).toBe('connecting')
    await expect(link.call('host.list', {})).rejects.toThrow(/not answering/)
  })

  it('on a code connection, says it is open and passes the running Fleet Console’s answer on before any credential', async () => {
    const hq = await fakeHq(ws => {
      ws.send(JSON.stringify({ version: '1.0', type: 'console.handover', payload: { from: 'running' } }))
      // Not a console link yet: a join or an envelope is not passed on.
      ws.send(JSON.stringify({ version: '1.0', type: 'join.request', payload: {} }))
    })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), null, HANDOVER), log: () => {} })
    const seen: string[] = []
    link.on('redeemOpen', () => seen.push('redeemOpen'))
    link.on('handover', frame => seen.push(`handover ${JSON.stringify(frame)}`))
    link.on('joinRequest', () => seen.push('joinRequest'))
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => seen.length >= 2)
    await new Promise(r => setTimeout(r, 20))
    expect(seen).toEqual(['redeemOpen', 'handover {"from":"running"}'])
    expect(link.state).toBe('connecting')
  })

  it('stops trying a code hq refused', async () => {
    const hq = await fakeHq(() => {}, 401)
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), null, FRESH), log: () => {} })
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => link.state === 'refused')
    expect(link.lastProblem).toMatch(/one-time code/)
  })

  it('states its version, and on a 426 says which side must upgrade @SC-1129', async () => {
    const ahead = `${Number(HOST_PROTOCOL_VERSION.split('.')[0]) + 2}.0`
    for (const [stated, problem] of [
      [`${HOST_PROTOCOL_VERSION_HEADER}: ${ahead}\r\n`, `HQ speaks protocol ${ahead} and the Fleet Console speaks ${HOST_PROTOCOL_VERSION}, too far apart to work together: upgrade the Fleet Console.`],
      ['', `HQ refused the Fleet Console's protocol ${HOST_PROTOCOL_VERSION} and stated no version of its own that the Fleet Console can read.`],
    ] as const) {
      const hq = await fakeHq(() => {}, 426, stated)
      const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), 'pairing-secret-0123456789', null), log: () => {} })
      cleanup.push(async () => link.stop(), hq.close)
      link.start()
      await until(() => link.state === 'versionMismatch')
      expect(hq.seen[0][HOST_PROTOCOL_VERSION_HEADER.toLowerCase()]).toBe(HOST_PROTOCOL_VERSION)
      expect(link.lastProblem).toBe(problem)
    }
  })

  it('passes envelopes and joins on, and ignores what is not a frame', async () => {
    let socket: WebSocket | null = null
    const hq = await fakeHq(ws => { socket = ws })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), 'pairing-secret-0123456789', null), log: () => {} })
    cleanup.push(async () => link.stop(), hq.close)
    const envelopes: unknown[] = []
    const joins: unknown[] = []
    link.on('envelope', e => envelopes.push(e))
    link.on('joinRequest', j => joins.push(j))
    link.start()
    await until(() => link.state === 'connected' && socket !== null)
    socket!.send('not json')
    socket!.send(JSON.stringify({ type: 'relay.envelope', payload: { envelope: { v: 1 } } }))
    socket!.send(JSON.stringify({ type: 'join.request', payload: { joinId: 'j' } }))
    await until(() => envelopes.length === 1 && joins.length === 1)
    expect(envelopes[0]).toEqual({ v: 1 })
  })
})

describe('the console link with a handover code @SC-877', () => {
  it('refuses a credential that comes without the machines: keeps nothing, says the move did not happen, and stops', async () => {
    const state = tempState()
    state.prepare()
    const hq = await fakeHq(ws => {
      ws.send(JSON.stringify({ version: '1.0', type: 'console.credential', payload: { credential: 'fcc_lasting-credential-abcdef' } }))
    })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(state, null, HANDOVER), log: () => {} })
    let notHandedOver = 0
    link.on('notHandedOver', () => notHandedOver++)
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => link.state === 'refused')
    expect(notHandedOver).toBe(1)
    expect(state.readText('hq-credential')).toBeNull()
    await new Promise(r => setTimeout(r, 50))
    expect(hq.seen).toHaveLength(1)
  })

  it('keeps the credential only once it said it holds the machines, and acknowledges it', async () => {
    const state = tempState()
    state.prepare()
    const frames: string[] = []
    const hq = await fakeHq(ws => {
      ws.on('message', raw => {
        const frame = JSON.parse(raw.toString())
        frames.push(frame.type)
        if (frame.type === 'console.handoverDone') {
          ws.send(JSON.stringify({ version: '1.0', type: 'console.credential', payload: { credential: 'fcc_lasting-credential-abcdef' } }))
        }
      })
    })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(state, null, HANDOVER), log: () => {} })
    link.on('redeemOpen', () => link.sendHandover('console.handoverDone', { certificate: {} }))
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => link.state === 'connected' && frames.includes('console.hello'))
    expect(frames.filter(f => f !== 'ping')).toEqual(['console.handoverDone', 'console.handoverAck', 'console.hello'])
    expect(state.readText('hq-credential')).toBe('fcc_lasting-credential-abcdef')
  })
})

describe('the console link with a fresh code @SC-877', () => {
  it('passes no answer from a running Fleet Console on: hq made the code, and could make one up', async () => {
    const hq = await fakeHq(ws => {
      ws.send(JSON.stringify({ version: '1.0', type: 'console.handover', payload: { from: 'hq' } }))
      ws.send(JSON.stringify({ version: '1.0', type: 'console.credential', payload: { credential: 'fcc_lasting-credential-abcdef' } }))
    })
    const link = new WsHqLink({ url: hq.url, credentials: new HqCredentials(tempState(), null, FRESH), log: () => {} })
    const handovers: unknown[] = []
    link.on('handover', f => handovers.push(f))
    cleanup.push(async () => link.stop(), hq.close)
    link.start()
    await until(() => link.state === 'connected')
    expect(handovers).toEqual([])
  })
})
