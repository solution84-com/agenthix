/**
 * The egress proxy (workflows spec part 2, *The containers* D): one process in a container of its own for each run
 * with hosts, whose only listening address is on that run's internal network. It answers the steps' DNS, and it
 * carries each connection a step makes to the proxy on an approved port on to the approved host it is for, which it
 * resolves itself and checks again by address. Nothing else gets out: the step's network has no route anywhere.
 *
 * Transparent: a step connects to an approved name as it would anywhere — DNS gives it the proxy's address — so
 * every tool works without proxy settings, ssh included. When two approved hosts share a port, the connection's TLS
 * server name or HTTP `Host` says which.
 *
 * It writes nothing a step sent — no name, no byte — to its output: one line when it is ready, or why it couldn't
 * start. A name a step looks up can carry a secret.
 *
 * This function runs from its source text, where nothing imported into this module exists, and a loader may rewrite
 * a reference to an import (vitest does): so everything it uses, Node's modules and the program's other functions,
 * arrives in `lib`.
 */
import type * as dgramModule from 'node:dgram'
import type * as dnsModule from 'node:dns'
import type * as netModule from 'node:net'
import type { WorkflowHost } from '@agenthix/core'
import type { answerDnsQuery } from './dnsAnswer'
import type { makeNonPublicCheck, normaliseAddress } from './addressPolicy'
import type { requestedName } from './requestedName'

export type EgressProxyConfig = {
  /** The proxy's address on the run's network: every listener binds to it, and DNS answers with it. */
  address: string
  dnsPort: number
  hosts: WorkflowHost[]
}

export type EgressProxyLib = {
  dgram: typeof dgramModule
  net: typeof netModule
  dns: typeof dnsModule
  answerDnsQuery: typeof answerDnsQuery
  makeNonPublicCheck: typeof makeNonPublicCheck
  normaliseAddress: typeof normaliseAddress
  requestedName: typeof requestedName
}

export async function runEgressProxy(config: EgressProxyConfig, lib: EgressProxyLib): Promise<void> {
  const { dgram, net, dns, answerDnsQuery, makeNonPublicCheck, normaliseAddress, requestedName } = lib
  const PEEK_MAX_BYTES = 16384
  const PEEK_MS = 10_000
  const CONNECT_MS = 15_000
  const MAX_CONNECTIONS = 256
  const DNS_MAX_TCP_BYTES = 4096

  const say = (line: Record<string, unknown>) => { process.stdout.write(`${JSON.stringify(line)}\n`) }
  const isLiteral = (host: string) => net.isIP(host.replace(/^\[(.*)\]$/, '$1')) !== 0
  const names = [...new Set(config.hosts.filter(h => !isLiteral(h.host)).map(h => h.host))]
  const isNonPublic = makeNonPublicCheck(net)
  const approvedAddress = (address: string, port: number) => config.hosts.some(h =>
    h.port === port && isLiteral(h.host) && normaliseAddress(h.host) === normaliseAddress(address))

  async function addressesFor(target: WorkflowHost): Promise<string[]> {
    const found = isLiteral(target.host)
      ? [normaliseAddress(target.host)]
      : await dns.promises.lookup(target.host, { all: true, order: 'verbatim' }).then(r => r.map(a => a.address), () => [] as string[])
    return found.filter(a => !isNonPublic(a) || approvedAddress(a, target.port))
  }

  function peek(sock: netModule.Socket): Promise<{ name: string | null; head: Buffer }> {
    return new Promise(resolve => {
      let head = Buffer.alloc(0)
      const done = (name: string | null) => {
        clearTimeout(timer)
        sock.off('data', onData)
        sock.off('end', onEnd)
        sock.pause()
        resolve({ name, head })
      }
      const onData = (d: Buffer) => {
        head = Buffer.concat([head, d])
        const name = requestedName(head)
        if (name !== undefined) done(name)
        else if (head.length >= PEEK_MAX_BYTES) done(null)
      }
      const onEnd = () => done(null)
      const timer = setTimeout(() => done(null), PEEK_MS)
      sock.on('data', onData)
      sock.on('end', onEnd)
    })
  }

  function connectTo(address: string, port: number): Promise<netModule.Socket | null> {
    return new Promise(resolve => {
      const up = net.connect({ host: address, port })
      const fail = () => { up.destroy(); resolve(null) }
      up.setTimeout(CONNECT_MS, fail)
      up.once('error', fail)
      up.once('connect', () => {
        up.setTimeout(0)
        up.off('error', fail)
        resolve(up)
      })
    })
  }

  async function relay(sock: netModule.Socket, port: number): Promise<void> {
    sock.on('error', () => sock.destroy())
    const candidates = config.hosts.filter(h => h.port === port)
    let target: WorkflowHost | null = candidates.length === 1 ? candidates[0]! : null
    let head: Buffer = Buffer.alloc(0)
    if (!target) {
      const peeked = await peek(sock)
      head = peeked.head
      const name = peeked.name === null ? null : normaliseAddress(peeked.name)
      target = candidates.find(c => (isLiteral(c.host) ? normaliseAddress(c.host) : c.host) === name) ?? null
    }
    if (!target) { sock.destroy(); return }
    for (const address of await addressesFor(target)) {
      if (sock.destroyed) return
      const up = await connectTo(address, port)
      if (!up) continue
      up.on('error', () => { up.destroy(); sock.destroy() })
      sock.on('close', () => up.destroy())
      up.on('close', () => sock.destroy())
      if (head.length) up.write(head)
      sock.pipe(up)
      up.pipe(sock)
      sock.resume()
      return
    }
    sock.destroy()
  }

  const udp = dgram.createSocket('udp4')
  udp.on('message', (msg, from) => {
    const answer = answerDnsQuery(msg, names, config.address)
    if (answer) udp.send(answer, from.port, from.address)
  })
  udp.on('error', () => {})

  const tcpDns = net.createServer(sock => {
    let buf = Buffer.alloc(0)
    sock.setTimeout(PEEK_MS, () => sock.destroy())
    sock.on('error', () => sock.destroy())
    sock.on('data', d => {
      buf = Buffer.concat([buf, d])
      while (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) {
        const n = buf.readUInt16BE(0)
        const answer = answerDnsQuery(buf.subarray(2, 2 + n), names, config.address)
        buf = buf.subarray(2 + n)
        if (!answer) continue
        const len = Buffer.alloc(2)
        len.writeUInt16BE(answer.length)
        sock.write(Buffer.concat([len, answer]))
      }
      if (buf.length > DNS_MAX_TCP_BYTES) sock.destroy()
    })
  })

  let open = 0
  const ports = [...new Set(config.hosts.map(h => h.port))]
  const servers = ports.map(port => {
    const server = net.createServer({ pauseOnConnect: false }, sock => {
      if (open >= MAX_CONNECTIONS) { sock.destroy(); return }
      open++
      sock.once('close', () => { open-- })
      relay(sock, port).catch(() => sock.destroy())
    })
    return { server, port }
  })

  const listen = (start: (ready: () => void) => void, on: { once(e: 'error', f: (err: Error) => void): unknown }) =>
    new Promise<void>((resolve, reject) => { on.once('error', reject); start(resolve) })
  try {
    await listen(ready => udp.bind(config.dnsPort, config.address, ready), udp)
    await listen(ready => tcpDns.listen(config.dnsPort, config.address, ready), tcpDns)
    for (const s of servers) await listen(ready => s.server.listen(s.port, config.address, ready), s.server)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    say({ failed: e.code ?? e.message ?? 'unknown' })
    process.exit(1)
  }
  for (const s of [tcpDns, ...servers.map(x => x.server)]) s.on('error', () => {})
  say({ ready: true })
}
