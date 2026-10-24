import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { CHOSEN_PORT_RANGE } from '@agenthix/core'
import { claimNames, freePorts, guardedDocker, portsTaken, refusal, testNamespace } from './containerGuard'

const NS = 'hteprot4242'

describe('a container test’s namespace @SC-1165', () => {
  it('is its own per run, valid as an install’s namespace, and never the real install’s', () => {
    const ns = testNamespace('prot')
    expect(ns).toBe(`hteprot${process.pid}`)
    expect(ns).toMatch(/^[a-z][a-z0-9-]{0,30}$/)
    expect(ns.startsWith('agenthix')).toBe(false)
    expect(() => testNamespace('Prot')).toThrow()
    expect(() => testNamespace('a'.repeat(30))).toThrow()
  })

  it('gives every name the host service derives from it under that namespace', () => {
    const names = claimNames(NS)
    expect(names.hostContainer).toBe(`${NS}-host`)
    expect(names.hostFiguresVolume).toBe(`${NS}-host-figures`)
  })
})

describe('the guard around each docker command a container test runs @SC-1165', () => {
  const refused = (...args: string[]) => refusal(NS, args)

  it('lets what only reads pass, whatever it names', () => {
    for (const args of [
      ['ps', '-a', '--format', '{{.Names}}'], ['inspect', 'agenthix-host'], ['logs', 'agenthix-site-server'],
      ['volume', 'ls', '-q'], ['volume', 'inspect', '-f', '{{.Mountpoint}}', 'agenthix-hq-db-data'],
      ['container', 'inspect', 'x'], ['image', 'inspect', 'agenthix-host'], ['port', `${NS}-console`, '4300/tcp'], ['info'],
    ]) expect(refused(...args)).toBeNull()
  })

  it('lets the test create, run, stop and remove what carries its namespace', () => {
    for (const args of [
      ['rm', '-f', `${NS}-host`, `${NS}-host-launcher`], ['container', 'rm', `${NS}-x`], ['stop', `${NS}-host`],
      ['volume', 'create', `${NS}-figures`], ['volume', 'rm', '-f', `${NS}-a`], ['network', 'create', '--driver', 'bridge', '--subnet', '10.0.0.0/29', `${NS}-net`],
      ['network', 'rm', `${NS}-net`], ['compose', '-p', `${NS}-site`, 'down', '-v'], ['compose', '-p', `${NS}-console`, '-f', '/tmp/c.json', 'up', '-d'],
      ['rmi', `${NS}-image:0.0.1`], ['build', '-f', 'Dockerfile', '-t', `${NS}-image:0.0.1`, '.'],
      ['run', '-d', '--name', `${NS}-host`, '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', `${NS}-host-figures:/run/host-figures`,
        '-v', '/tmp/state:/state', '--network', 'host', 'agenthix-host'],
      ['run', '--rm', '--network', `${NS}-hq-link`, '--entrypoint', 'wget', 'agenthix-console', '-q', 'http://x'],
      ['run', '--rm', '--network', 'bridge', 'agenthix-host'], ['run', '--name=' + `${NS}-x`, 'agenthix-host'],
      ['exec', '-i', `${NS}-host`, 'agenthix', 'status'],
      ['exec', `${NS}-host`, 'docker', 'compose', '-p', `${NS}-site`, '-f', '/state/site/compose.json', 'up', '-d'],
      ['compose', 'version'], ['exec', `${NS}-host`, 'docker', 'compose', 'version'],
      ['exec', `${NS}-host`, 'nft', 'delete', 'table', 'inet', 'hteprot4242_agents'],
    ]) expect(refused(...args)).toBeNull()
  })

  it('refuses to remove or stop what does not carry its namespace, the real install’s above all', () => {
    expect(refused('rm', '-f', 'agenthix-host')).toMatch(/agenthix-host/)
    expect(refused('rm', '-f', `${NS}-host`, 'agenthix-site-server')).toMatch(/agenthix-site-server/)
    expect(refused('container', 'rm', 'abc123')).not.toBeNull()
    expect(refused('stop', 'agenthix-hq-server')).not.toBeNull()
    expect(refused('volume', 'rm', 'agenthix-host-figures')).not.toBeNull()
    expect(refused('network', 'rm', 'agenthix-hq-link')).not.toBeNull()
    expect(refused('rmi', 'agenthix-host:launcher-test-0.0.1')).not.toBeNull()
  })

  it('refuses a name that only starts like its namespace', () => {
    expect(refused('rm', '-f', `${NS}1-host`)).not.toBeNull()
    expect(refused('rm', '-f', NS)).not.toBeNull()
  })

  it('refuses a compose project outside its namespace, or none', () => {
    for (const p of ['agenthix-site', 'agenthix-hq', 'agenthix-console']) expect(refused('compose', '-p', p, 'down', '-v')).toMatch(p)
    expect(refused('compose', '--project-name', 'agenthix-hq', 'down')).not.toBeNull()
    expect(refused('compose', 'down', '-v')).toMatch(/project/)
  })

  it('refuses to name a container, a volume or a network outside its namespace', () => {
    expect(refused('run', '-d', '--name', 'agenthix-host', 'agenthix-host')).not.toBeNull()
    expect(refused('run', '-d', '--name', `${NS}-host`, '-v', 'agenthix-host-figures:/run/host-figures', 'img')).toMatch(/agenthix-host-figures/)
    expect(refused('run', '--rm', '--mount', 'type=volume,src=agenthix-hq-storage,dst=/v', 'img')).not.toBeNull()
    expect(refused('run', '--rm', '--network', 'agenthix-hq-link', 'img')).not.toBeNull()
    expect(refused('volume', 'create', 'agenthix-host-figures')).not.toBeNull()
    expect(refused('network', 'create', 'agenthix-hq-link')).not.toBeNull()
    expect(refused('build', '-t', 'agenthix-host', '.')).not.toBeNull()
  })

  it('refuses to reach into a container outside its namespace, or to run docker there out of bounds', () => {
    expect(refused('exec', '-i', 'agenthix-host', 'agenthix', 'status')).not.toBeNull()
    expect(refused('exec', `${NS}-host`, 'docker', 'compose', '-p', 'agenthix-site', 'down', '-v')).toMatch(/agenthix-site/)
    expect(refused('exec', `${NS}-host`, 'docker', 'rm', '-f', 'agenthix-host')).not.toBeNull()
  })

  it('refuses to delete a firewall table not its own', () => {
    expect(refused('exec', `${NS}-host`, 'nft', 'delete', 'table', 'inet', 'agenthix_agents')).toMatch(/agenthix_agents/)
    expect(refused('run', '--rm', '--network', 'host', '--cap-add', 'NET_ADMIN', '--entrypoint', 'nft', 'img', 'delete', 'table', 'inet', 'agenthix_agents')).not.toBeNull()
  })

  it('refuses what clears the machine, and any command it does not know', () => {
    for (const args of [['system', 'prune', '-f'], ['volume', 'prune'], ['container', 'prune'], ['network', 'prune'], ['image', 'prune'], ['kill', 'x'], ['swarm', 'leave']]) {
      expect(refused(...args)).not.toBeNull()
    }
  })
})

describe('docker, as a container test runs it @SC-1165', () => {
  it('refuses before running, and teardown never swallows the refusal', () => {
    const docker = guardedDocker(NS)
    expect(() => docker('rm', '-f', 'agenthix-host')).toThrow(/Refused `docker rm -f agenthix-host`: it would remove agenthix-host, outside/)
    expect(() => docker.quiet('compose', '-p', 'agenthix-hq', 'down', '-v')).toThrow(/Refused/)
    expect(() => docker.with({ input: 'x' }, 'exec', '-i', 'agenthix-host', 'agenthix')).toThrow(/Refused/)
  })
})

describe('a port a container test checks @SC-1165', () => {
  let server: net.Server | null = null
  afterEach(() => new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve())))

  it('is reported taken while something listens on it, and free once it stops', async () => {
    server = net.createServer()
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as net.AddressInfo).port
    expect(await portsTaken([port])).toEqual([port])
    await new Promise<void>(resolve => server!.close(() => resolve()))
    server = null
    expect(await portsTaken([port])).toEqual([])
  })
})

describe('the free ports a container test chooses @SC-1165', () => {
  it('are distinct, inside the range a person may choose, and not held', async () => {
    const ports = await freePorts(3)
    expect(new Set(ports).size).toBe(3)
    for (const p of ports) {
      expect(p).toBeGreaterThanOrEqual(CHOSEN_PORT_RANGE.first)
      expect(p).toBeLessThanOrEqual(CHOSEN_PORT_RANGE.last)
    }
    expect(await portsTaken(ports)).toEqual([])
  })
})
