/**
 * A live preview's container, made for real (live preview spec section 6, *May not reach*, and section 4, *The app*):
 * it matches its template, binds its copy alone, has no Docker socket, no capability, a read-only root and IPv6 off,
 * is on a network of its own in the live-preview part of the range, and an app that listens only on `localhost`
 * inside it is reached through the site's relay and seen by the guard's look (F13), and many requests at once reach it
 * through one forwarder exec. Removed with nothing left.
 *
 * Run with `npm run test:container` from site/. Needs Docker and the agent image (`agenthix-agent:latest` unless
 * AGENT_IMAGE says otherwise); skipped when either is missing. One container and one network, named
 * `<LIVE_PREVIEW_TEST_NAMESPACE>-*` (`lp-container-test-*` unless set), capped at 2 GB and 2 processors, removed at the end. The host service's firewall rules for the
 * live-preview part are the host service's own tests'.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { request } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'

process.env.HOST_NAMESPACE = process.env.LIVE_PREVIEW_TEST_NAMESPACE?.trim() || 'lp-container-test'
process.env.AGENT_NETWORK_RANGE = process.env.LIVE_PREVIEW_TEST_RANGE ?? '10.231.0.0/20'
process.env.AGENT_CONTAINER_MEMORY = '2g'
process.env.AGENT_CONTAINER_CPUS = '2'
delete process.env.SITE_CONTAINER_NAME

const image = process.env.AGENT_IMAGE?.trim() || 'agenthix-agent:latest'
const ready = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0

const { containerDifferences, startContainer, stopContainers, leftovers } = await import('../container/container')
const { helperInPreview, spawnHelper, spawnInPreview } = await import('../container/exec')
const { connectToApp } = await import('../apps/appConnect')
const { AppStreams } = await import('../apps/appStreams')
const { readSnapshot, snapshotArgv } = await import('../guard/processes')
const { inspectContainer } = await import('../container/docker')
const { livePreviewContainerName } = await import('../container/labels')
const { handSecrets } = await import('../secrets/handedSecrets')
const { material } = await import('../../../executor/masking/__tests__/material')

const ID = `ct${Date.now().toString(36)}`
const LP = { id: ID, workspaceId: 'w1', personId: 'p1', projectId: 'pr1' }
let copy: string

const ROOT = '/projects/pr1/clones/c1'
// An app that reads its secret once, as it starts, the way most read their settings.
const READS_AT_START = "const v = (() => { try { return require('fs').readFileSync('/run/secrets/SHOP_API_KEY', 'utf8') } catch { return 'none' } })(); require('http').createServer((q, s) => s.end(v)).listen(5174, '127.0.0.1')"

async function answers(port: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try { return await get(port) } catch { await new Promise(r => setTimeout(r, 250)) }
  }
  return get(port)
}

const APP = "require('http').createServer((q, s) => s.end('hello from localhost')).listen(5173, '127.0.0.1')"

async function get(socketPort: number): Promise<string> {
  const { socket } = await connectToApp(ID, socketPort)
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port: socketPort, path: '/', createConnection: () => socket as never }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => resolve(body))
    })
    req.on('error', reject)
    req.end()
  })
}

withFeature('livePreview', () => {
  describe.skipIf(!ready)("a live preview's container", () => {
    beforeAll(async () => {
      process.env.AGENT_IMAGE = image
      copy = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-copy-'))
      fs.writeFileSync(path.join(copy, 'index.html'), 'hi\n')
      await startContainer(LP, { hostDir: fs.realpathSync(copy), containerDir: '/projects/pr1/clones/c1' })
    })

    afterAll(async () => {
      await stopContainers(ID).catch(() => {})
      fs.rmSync(copy, { recursive: true, force: true })
    })

    it('matches its template and binds its copy alone @SC-1734', async () => {
      expect(await containerDifferences(ID)).toEqual([])
      const inspect = await inspectContainer(livePreviewContainerName(ID)) as { Mounts: { Destination: string }[]; HostConfig: { CapAdd: unknown } }
      expect(inspect.Mounts.map(m => m.Destination)).toEqual(['/projects/pr1/clones/c1'])
      expect(inspect.HostConfig.CapAdd).toBeNull()
    })

    it('has no Docker socket, a read-only root, IPv6 off, and the image\'s user @SC-1734', async () => {
      expect((await helperInPreview(ID, ['test', '-e', '/var/run/docker.sock'], 10_000)).exitCode).not.toBe(0)
      expect((await helperInPreview(ID, ['touch', '/written'], 10_000)).exitCode).not.toBe(0)
      expect((await helperInPreview(ID, ['cat', '/proc/sys/net/ipv6/conf/all/disable_ipv6'], 10_000)).stdout.trim()).toBe('1')
      expect((await helperInPreview(ID, ['id', '-u'], 10_000)).stdout.trim()).toBe('1001')
      expect((await helperInPreview(ID, ['cat', '/projects/pr1/clones/c1/index.html'], 10_000)).stdout).toBe('hi\n')
    })

    it('is on its own network, in the live-preview part of the range @SC-1735', async () => {
      const out = spawnSync('docker', ['network', 'inspect', '--format', '{{range .IPAM.Config}}{{.Subnet}}{{end}}', `${livePreviewContainerName(ID)}-net`]).stdout.toString().trim()
      const third = Number(out.split('.')[2])
      expect(out.startsWith('10.231.')).toBe(true)
      expect(third).toBeGreaterThanOrEqual(8)
    })

    it('reaches an app that listens only on localhost, which the guard sees listening, and 100 requests at once through one forwarder @SC-1736', async () => {
      const app = await spawnHelper(ID, ['node', '-e', APP])
      try {
        let snapshot = null
        for (let i = 0; i < 30; i++) {
          snapshot = readSnapshot((await helperInPreview(ID, snapshotArgv(), 5_000)).stdout)
          if (snapshot?.listening.loopback.includes(5173)) break
          await new Promise(r => setTimeout(r, 500))
        }
        expect(snapshot?.listening.loopback).toContain(5173)
        expect(snapshot?.listening.open).not.toContain(5173)
        expect(await get(5173)).toBe('hello from localhost')

        const spawns: string[][] = []
        const streams = new AppStreams({
          spawn: (id, argv) => { spawns.push(argv); return spawnHelper(id, argv) },
          hold: () => () => {}, execBegins: () => () => {}, now: Date.now,
        })
        try {
          const bodies = await Promise.all(Array.from({ length: 100 }, async () => {
            const { socket } = await streams.connect(ID, 5173)
            return new Promise<string>((resolve, reject) => {
              const req = request({ host: 'localhost', port: 5173, path: '/', createConnection: () => socket as never }, res => {
                let body = ''
                res.on('data', d => { body += d })
                res.on('end', () => { socket.destroy(); resolve(body) })
              })
              req.on('error', reject)
              req.end()
            })
          }))
          expect(bodies.every(b => b === 'hello from localhost')).toBe(true)
          expect(spawns.length).toBe(1)
        } finally {
          streams.stopAll()
        }
      } finally {
        app.detach()
      }
    })

    it('takes a workflow\'s secrets into its own memory-backed folder, readable by its apps and outside the copy @SC-1746', async () => {
      const KEY = 'sk_test_canary_7f3a9c1e'
      await handSecrets(ID, { STRIPE_KEY: Buffer.from(KEY), OLD: Buffer.from('old') }, material({ STRIPE_KEY: KEY }))
      await handSecrets(ID, { STRIPE_KEY: Buffer.from(KEY) }, material({ STRIPE_KEY: KEY }))
      expect((await helperInPreview(ID, ['cat', '/run/secrets/STRIPE_KEY'], 10_000)).stdout).toBe(KEY)
      expect((await helperInPreview(ID, ['test', '-e', '/run/secrets/OLD'], 10_000)).exitCode).not.toBe(0)
      expect((await helperInPreview(ID, ['stat', '-c', '%a %u', '/run/secrets/STRIPE_KEY'], 10_000)).stdout.trim()).toBe('400 1001')
      expect((await helperInPreview(ID, ['touch', '/run/secrets/new'], 10_000)).exitCode).not.toBe(0)
      expect((await helperInPreview(ID, ['grep', '-r', KEY, '/projects/pr1/clones/c1'], 10_000)).exitCode).not.toBe(0)
      expect(fs.readdirSync(copy)).toEqual(['index.html'])
      expect(await containerDifferences(ID)).toEqual([])
    })

    it('hands secrets to an app through the launcher: not read by one started before, read once it restarts @SC-1746', async () => {
      const KEY = 'shop_canary_2b9d41'
      const before = await spawnInPreview(ID, ROOT, ['node', '-e', READS_AT_START], { cwd: ROOT }, () => {})
      try {
        expect(await answers(5174)).toBe('none')
        await handSecrets(ID, { SHOP_API_KEY: Buffer.from(KEY) }, material({ SHOP_API_KEY: KEY }))
        expect(await get(5174)).toBe('none')
      } finally {
        before.detach()
        // Ending the docker client leaves the app running: it is stopped as an app is, and gone before the restart.
        await helperInPreview(ID, ['sh', '-c', 'pkill -f "listen.517[4]" || true'], 10_000)
        for (let i = 0; i < 40 && await get(5174).then(() => true, () => false); i++) await new Promise(r => setTimeout(r, 250))
      }
      const after = await spawnInPreview(ID, ROOT, ['node', '-e', READS_AT_START], { cwd: ROOT }, () => {})
      try {
        expect(await answers(5174)).toBe(KEY)
      } finally {
        after.detach()
      }
    })

    it('leaves nothing behind when it stops @SC-1734', async () => {
      await stopContainers(ID)
      expect(await leftovers(ID)).toEqual([])
    })
  })
})
