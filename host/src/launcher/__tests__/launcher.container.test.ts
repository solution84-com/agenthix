/**
 * The launcher against a real Docker (`npm run test:container`, with HOST_E2E=1). It builds the host service's
 * image twice at the repository root, as release builds 0.0.1 and 0.0.2, and a third that never answers, then runs
 * 0.0.1 as the machine's host service container and switches it with the launcher, as the host service does once it has
 * checked an image's signature: refused when not forward, put back when the new one never answers, and done.
 *
 * It takes a namespace of its own for the run, recorded in the state folder, so its containers, images, firewall table
 * and figures volume are its own, and every docker command goes through the guard (`containerGuard.ts`): it needs no
 * port and can run beside a real install, touching none of it. It still refuses to start if a container of its
 * namespace is already there.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runArgs } from '../../docker/containers'
import { launcherSpec } from '../start'
import type { HostSwitch } from '../journal'
import type { HostContainerRecord } from '../record'
import { tableFor } from '../../protections/rules'
import { claimNames, guardedDocker, recordNamespace, testNamespace } from '../../__tests__/containerGuard'

const ROOT = path.resolve(__dirname, '../../../..')
const NS = testNamespace('launch')
const NAMES = claimNames(NS)
const TAG = `${NS}-image`
const OLD = `${TAG}:0.0.1`
const NEW = `${TAG}:0.0.2`
const SILENT = `${TAG}:silent`
const HOST = NAMES.hostContainer
const PREVIOUS = NAMES.previousHostContainer
const LAUNCHER = NAMES.launcherContainer
const VOLUME = NAMES.hostFiguresVolume
let state: string

const guard = guardedDocker(NS, { timeout: 15 * 60_000 })
const docker = (args: string[], input?: string) => guard.with({ input }, ...args)
const tryDocker = guard.quiet
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const imageId = (ref: string) => docker(['image', 'inspect', '--format', '{{.Id}}', ref]).trim()
const containerOf = (name: string) => JSON.parse(docker(['container', 'inspect', '--format', '{{json .}}', name]))
const exists = (name: string) => { try { docker(['container', 'inspect', name]); return true } catch { return false } }

/** Reads a file of the state folder through a container, since on Linux what the service wrote belongs to root. */
const readState = (file: string) => docker(['run', '--rm', '-v', `${state}:/state`, '--entrypoint', 'cat', OLD, `/state/${file}`])
const writeState = (file: string, text: string) =>
  docker(['run', '--rm', '-i', '-v', `${state}:/state`, '--entrypoint', 'sh', OLD, '-c', `mkdir -p /state/launcher && cat > /state/${file}`], text)

function answer(): string | null {
  try {
    return JSON.parse(docker(['exec', HOST, 'node', '/app/dist/launcher.js', 'answer']).trim()).version
  } catch {
    return null
  }
}

/** What the host service does once the image is checked: writes the switch down, then starts the launcher. */
async function switchTo(image: string, to: string, answerWithinMs = 3 * 60_000): Promise<HostSwitch> {
  const record = JSON.parse(readState('launcher/container.json')) as HostContainerRecord
  const id = imageId(image)
  const s: HostSwitch = {
    from: '0.0.1', to, ref: `ghcr.io/solution84-com/agenthix-host@sha256:${'0'.repeat(64)}`, imageId: id, checked: true,
    oldContainer: record.containerId, answerWithinMs, startedAt: new Date().toISOString(), phase: 'ready', attempts: 0,
    waitingSince: null, endedAt: null, reason: null,
  }
  writeState('launcher/switch.json', JSON.stringify(s))
  tryDocker('rm', '-f', LAUNCHER)
  docker(runArgs(launcherSpec(record, id, NAMES)))
  for (let i = 0; i < 150; i++) {
    const now = JSON.parse(readState('launcher/switch.json')) as HostSwitch
    if (['done', 'failed', 'refused'].includes(now.phase)) return now
    await sleep(2_000)
  }
  throw new Error('The launcher did not end within 5 minutes.')
}

describe.skipIf(!process.env.HOST_E2E)('the launcher', () => {
  beforeAll(async () => {
    for (const name of [HOST, PREVIOUS, LAUNCHER]) {
      if (exists(name)) throw new Error(`This test needs no container named ${name} on this machine.`)
    }
    docker(['build', '-f', path.join(ROOT, 'host/docker/Dockerfile'), '--build-arg', 'VERSION=0.0.1', '-t', OLD, ROOT])
    docker(['build', '-f', path.join(ROOT, 'host/docker/Dockerfile'), '--build-arg', 'VERSION=0.0.2', '-t', NEW, ROOT])
    docker(['build', '-t', SILENT, '-'], `FROM ${NEW}\nCMD ["sleep", "3600"]\n`)
    state = fs.mkdtempSync(path.join(os.tmpdir(), 'host-launcher-'))
    recordNamespace(state, NS)
    docker(['volume', 'create', VOLUME])
    docker(['run', '-d', '--name', HOST, '--label', `com.docker.compose.project=${NAMES.hostProject}`, '--restart', 'unless-stopped', '-v', '/var/run/docker.sock:/var/run/docker.sock',
      '-v', `${state}:/state`, '-v', `${VOLUME}:/run/host-figures`, '-e', 'TZ=Europe/London', '--network', 'host', '--cap-add', 'NET_ADMIN', OLD])
    for (let i = 0; i < 100 && answer() !== '0.0.1'; i++) await sleep(300)
    for (let i = 0; i < 50; i++) {
      try { readState('launcher/container.json'); break } catch { await sleep(300) }
    }
  }, 30 * 60_000)

  afterAll(() => {
    tryDocker('run', '--rm', '--network', 'host', '--cap-add', 'NET_ADMIN', '--entrypoint', 'nft', OLD, 'delete', 'table', 'inet', tableFor(NS))
    if (state) tryDocker('run', '--rm', '-v', `${state}:/state`, '--entrypoint', 'sh', OLD, '-c', 'rm -rf /state/* /state/.[!.]*')
    for (const c of [LAUNCHER, PREVIOUS, HOST]) tryDocker('rm', '-f', c)
    tryDocker('volume', 'rm', VOLUME)
    for (const image of [SILENT, NEW, OLD]) tryDocker('rmi', image)
    if (state) fs.rmSync(state, { recursive: true, force: true })
  })

  it('records the settings the host service runs with, from Docker @SC-838', () => {
    const record = JSON.parse(readState('launcher/container.json')) as HostContainerRecord
    expect(record).toMatchObject({ network: 'host', capAdd: expect.arrayContaining([expect.stringMatching(/NET_ADMIN$/)]), env: ['TZ=Europe/London'], restart: 'unless-stopped' })
    expect(record.mounts.map(m => m.destination).sort()).toEqual(['/run/host-figures', '/state', '/var/run/docker.sock'])
  })

  it('refuses a version that is not newer, and leaves the host service running', async () => {
    const before = containerOf(HOST).Id
    const ended = await switchTo(OLD, '0.0.1')
    expect(ended).toMatchObject({ phase: 'refused', reason: expect.stringContaining('only goes forward') })
    expect(containerOf(HOST)).toMatchObject({ Id: before, State: { Running: true } })
    expect(answer()).toBe('0.0.1')
  }, 6 * 60_000)

  it('puts the old host service back when the new one never answers', async () => {
    const before = containerOf(HOST).Id
    const ended = await switchTo(SILENT, '0.0.2', 20_000)
    expect(ended).toMatchObject({ phase: 'failed', reason: expect.stringContaining('did not answer within') })
    expect(containerOf(HOST)).toMatchObject({ Id: before, State: { Running: true } })
    expect(exists(PREVIOUS)).toBe(false)
    for (let i = 0; i < 100 && answer() !== '0.0.1'; i++) await sleep(300)
    expect(answer()).toBe('0.0.1')
  }, 6 * 60_000)

  it('switches to the new version with the same settings, and removes the old one', async () => {
    const before = containerOf(HOST).Id
    const ended = await switchTo(NEW, '0.0.2')
    expect(ended).toMatchObject({ phase: 'done', reason: null })
    const now = containerOf(HOST)
    expect(now.Id).not.toBe(before)
    expect(now.Image).toBe(imageId(NEW))
    expect(now.Config.Env).toContain('TZ=Europe/London')
    expect(now.HostConfig).toMatchObject({ NetworkMode: 'host', RestartPolicy: { Name: 'unless-stopped' } })
    expect(now.Config.Labels).toMatchObject({ 'com.docker.compose.project': NAMES.hostProject })
    expect(answer()).toBe('0.0.2')
    expect(exists(PREVIOUS)).toBe(false)
    expect(exists(before)).toBe(false)
    expect(containerOf(LAUNCHER)).toMatchObject({ State: { Running: false }, HostConfig: { RestartPolicy: { Name: 'no' } } })
  }, 6 * 60_000)
})
