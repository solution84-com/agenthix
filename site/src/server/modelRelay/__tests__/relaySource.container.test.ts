/**
 * The relay's source check on a Linux Docker engine, with real containers (relaySource.ts): each agent container has a
 * network of its own, so a request reaches the site from that container's own address, and a request carrying one
 * turn's container name from any other container is refused by where it came from, whatever token it holds.
 *
 * Only on Linux outside Docker Desktop: there, every container's request arrives from the port forwarder's loopback
 * address, and the check can't tell containers apart (it accepts loopback for any of them, by design).
 *
 * Run with `npm run test:container` from site/. Needs Docker and the agent image (AGENT_TEST_IMAGE,
 * `imgtest/agent:dev` by default), for its curl.
 */
import { execFile, spawnSync } from 'node:child_process'
import http from 'node:http'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { agentNetworkName } from '../../../agents/runtime/containerNetwork'
import { checkRelaySource, resetRelaySourceForTests } from '../relaySource'

const run = promisify(execFile)
const IMAGE = process.env.AGENT_TEST_IMAGE ?? 'imgtest/agent:dev'
const linuxEngine = process.platform === 'linux'
  && !/docker desktop/i.test(spawnSync('docker', ['info', '--format', '{{.OperatingSystem}}'], { encoding: 'utf8' }).stdout ?? '')
const enabled = linuxEngine && spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

const TURN = 'relay-source-test-turn'
const OTHER = 'relay-source-test-other'
const SUBNETS: Record<string, string> = { [TURN]: '10.214.252.0/29', [OTHER]: '10.214.252.8/29' }

const docker = async (...args: string[]) => (await run('docker', args, { timeout: 60_000 })).stdout
let server: http.Server
let port = 0

/** What the site answers a relay request for TURN's container, sent from `from`. */
const ask = async (from: string) =>
  (await docker('exec', from, 'curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', `http://host.docker.internal:${port}/`)).trim()

describe.skipIf(!enabled)("the model relay's source check, on a Linux engine", () => {
  beforeAll(async () => {
    resetRelaySourceForTests()
    server = http.createServer((req, res) => {
      void checkRelaySource(TURN, req.socket.remoteAddress).then(ok => { res.statusCode = ok ? 200 : 403; res.end() })
    })
    await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve))
    port = (server.address() as { port: number }).port
    for (const name of [TURN, OTHER]) {
      await docker('rm', '-f', name).catch(() => '')
      await docker('network', 'rm', agentNetworkName(name)).catch(() => '')
      await docker('network', 'create', '--driver', 'bridge', '--subnet', SUBNETS[name], agentNetworkName(name))
      await docker('run', '-d', '--name', name, '--network', agentNetworkName(name), '--add-host', 'host.docker.internal:host-gateway',
        IMAGE, 'tail', '-f', '/dev/null')
    }
  }, 120_000)

  afterAll(async () => {
    for (const name of [TURN, OTHER]) {
      await docker('rm', '-f', name).catch(() => '')
      await docker('network', 'rm', agentNetworkName(name)).catch(() => '')
    }
    server?.closeAllConnections()
    await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve())
  }, 60_000)

  it("accepts a request from the turn's own container, and refuses the same request from another container", async () => {
    expect(await ask(TURN)).toBe('200')
    expect(await ask(OTHER)).toBe('403')
  })
})
