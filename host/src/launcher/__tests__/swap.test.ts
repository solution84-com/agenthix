import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StateFolder } from '../../state/folder'
import { ANSWER_WITHIN_MS, readSwitch, writeSwitch, type HostSwitch } from '../journal'
import { recordHostContainer } from '../record'
import { namesFor } from '../../state/namespace'
import { runSwitch, type LauncherEnv } from '../swap'
import { FakeContainers, NEW_IMAGE, OLD_ID, OLD_IMAGE } from './fakeContainers'

let dir: string
let state: StateFolder
let docker: FakeContainers
let clock: number
let env: LauncherEnv

const PINNED = `ghcr.io/solution84-com/agenthix-host@sha256:${'d'.repeat(64)}`
/** What the new host service is started from: the checked digest, and the tag it reads its version from. */
const STARTED_AS = `ghcr.io/solution84-com/agenthix-host:0.3.0@sha256:${'d'.repeat(64)}`

function ready(over: Partial<HostSwitch> = {}): HostSwitch {
  return writeSwitch(state, {
    from: '0.2.0', to: '0.3.0', ref: PINNED, imageId: NEW_IMAGE, checked: true, oldContainer: OLD_ID,
    answerWithinMs: ANSWER_WITHIN_MS, startedAt: new Date(clock).toISOString(), phase: 'ready', attempts: 0,
    waitingSince: null, endedAt: null, reason: null, ...over,
  })
}

const host = () => docker.byName('agenthix-host')
const ran = () => docker.calls.filter(c => c.startsWith('run '))

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-'))
  state = new StateFolder(dir)
  state.prepare()
  docker = new FakeContainers()
  docker.refs.set(STARTED_AS, NEW_IMAGE)
  clock = Date.parse('2026-10-14T09:00:00Z')
  env = { containers: docker, state, names: namesFor('agenthix'), ownVersion: '0.2.0', now: () => new Date(clock), sleep: async ms => { clock += ms }, pollMs: 3_000 }
  await recordHostContainer(docker, state, new Date(clock), 'agenthix-host')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('the launcher @SC-838', () => {
  it('starts the new host service with the recorded settings, and removes the old one once it answers as its version', async () => {
    ready()
    const ended = await runSwitch(env, NEW_IMAGE)
    expect(ended).toMatchObject({ phase: 'done', reason: null })
    const now = host()!
    expect(now).toMatchObject({ image: NEW_IMAGE, running: true, network: 'host', capAdd: ['NET_ADMIN'], restart: 'unless-stopped' })
    expect(now.id).not.toBe(OLD_ID)
    expect(now.env).toContain('TZ=Europe/London')
    expect(now.mounts!.map(m => m.destination)).toEqual(['/var/run/docker.sock', '/state', '/run/host-figures'])
    expect(docker.containers.has(OLD_ID)).toBe(false)
    expect(docker.byName('agenthix-host-previous')).toBeNull()
  })

  it("starts the new host service in the host service's own group, as the one it replaced was @SC-1156", async () => {
    ready()
    await runSwitch(env, NEW_IMAGE)
    expect(host()!.labels).toEqual({ 'com.docker.compose.project': 'agenthix-host' })
  })

  it('names everything it touches from the recorded namespace @SC-1156', async () => {
    docker = new FakeContainers('acme')
    docker.refs.set(STARTED_AS, NEW_IMAGE)
    env = { ...env, containers: docker, names: namesFor('acme') }
    await recordHostContainer(docker, state, new Date(clock), 'acme-host')
    ready()
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'done' })
    expect(docker.byName('acme-host')).toMatchObject({ image: NEW_IMAGE, labels: { 'com.docker.compose.project': 'acme-host' } })
  })

  it('stops the old host service before it starts the new one, so only one runs at a time', async () => {
    ready()
    await runSwitch(env, NEW_IMAGE)
    const order = docker.calls.filter(c => /^(stop|rename|run) /.test(c))
    expect(order).toEqual([`stop ${OLD_ID}`, `rename ${OLD_ID}`, `run agenthix-host ${STARTED_AS}`])
  })

  it('starts the new host service by its version’s tag and the checked digest, so it answers as that version @SC-1258', async () => {
    ready()
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'done' })
    expect(host()).toMatchObject({ image: NEW_IMAGE, reference: STARTED_AS })
  })

  it('refuses an image the host service did not check, and changes nothing', async () => {
    ready({ checked: false })
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('was not checked') })
    expect(host()).toMatchObject({ id: OLD_ID, running: true })
    expect(ran()).toEqual([])
  })

  it('refuses an image it was not given by the host service, and one with no switch written down', async () => {
    ready()
    expect(await runSwitch(env, `sha256:${'e'.repeat(64)}`)).toMatchObject({ phase: 'refused' })
    fs.rmSync(state.path('launcher', 'switch.json'))
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'refused' })
    expect(host()).toMatchObject({ id: OLD_ID, running: true })
    expect(ran()).toEqual([])
  })

  it('refuses an older version, or the same one, and only goes forward @SC-1275', async () => {
    ready({ to: '0.1.9' })
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('only goes forward') })
    ready({ to: '0.2.0' })
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'refused' })
    expect(ran()).toEqual([])
  })

  it('refuses a launcher that is not the version being replaced, or is a development build', async () => {
    ready()
    expect(await runSwitch({ ...env, ownVersion: '0.2.1' }, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('not the host service 0.2.0') })
    ready()
    expect(await runSwitch({ ...env, ownVersion: 'dev' }, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('development build') })
    expect(ran()).toEqual([])
  })

  it('puts the old host service back when the new one never answers', async () => {
    docker.silent.add(NEW_IMAGE)
    ready()
    const started = clock
    const ended = await runSwitch(env, NEW_IMAGE)
    expect(ended).toMatchObject({ phase: 'failed', reason: expect.stringContaining('did not answer within 3 minutes') })
    expect(clock - started).toBeGreaterThanOrEqual(ANSWER_WITHIN_MS)
    expect(host()).toMatchObject({ id: OLD_ID, image: OLD_IMAGE, running: true })
    expect([...docker.containers.values()].map(c => c.name)).toEqual(['agenthix-host'])
  })

  it('puts the old one back when the new one answers as another version, or cannot be started', async () => {
    const exec = docker.exec.bind(docker)
    docker.exec = async (name: string, command: string[]) => ({ ...(await exec(name, command)), stdout: '{"version":"0.2.0"}\n' })
    ready()
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'failed', reason: expect.stringContaining('answered as 0.2.0') })
    expect(host()).toMatchObject({ id: OLD_ID, running: true })

    docker.exec = exec
    docker.failing.add('run')
    ready()
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'failed', reason: expect.stringContaining('could not be started') })
    expect(host()).toMatchObject({ id: OLD_ID, running: true })
  })

  it('says so, with the commands, when the old one cannot be started again either', async () => {
    docker.silent.add(NEW_IMAGE)
    docker.failing.add('start')
    ready()
    const ended = await runSwitch(env, NEW_IMAGE)
    expect(ended.phase).toBe('failed')
    expect(ended.reason).toContain('could not be started again either')
    expect(ended.reason).toContain('docker start agenthix-host')
  })
})

describe('Docker failing at a launcher\'s first look or at the put-back', () => {
  it('ends the switch as failed when the first check throws, instead of leaving it for a restart to repeat', async () => {
    docker.image = async () => { throw new Error('docker unavailable') }
    ready()
    const ended = await runSwitch(env, NEW_IMAGE)
    expect(ended).toMatchObject({ phase: 'failed', reason: expect.stringContaining('Nothing was changed.') })
    expect(readSwitch(state)!.phase).toBe('failed')
    expect(host()).toMatchObject({ id: OLD_ID, running: true })
  })

  it('does not take a Docker error at the put-back for a missing host service, and gives the commands', async () => {
    docker.silent.add(NEW_IMAGE)
    ready()
    const inspect = docker.inspect.bind(docker)
    docker.inspect = async (n: string) => {
      if (readSwitch(state)?.phase === 'puttingBack') throw new Error('docker is busy')
      return inspect(n)
    }
    const ended = await runSwitch(env, NEW_IMAGE)
    expect(ended.phase).toBe('failed')
    expect(ended.reason).not.toContain('is gone')
    expect(ended.reason).toContain('docker rename agenthix-host-previous agenthix-host')
  })
})

describe('a launcher started again partway @SC-838', () => {
  it('carries on after the old one was stopped and set aside, before the new one started', async () => {
    ready({ phase: 'switching', attempts: 1 })
    await docker.stop(OLD_ID)
    await docker.rename(OLD_ID, 'agenthix-host-previous')
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'done' })
    expect(host()!.image).toBe(NEW_IMAGE)
    expect(docker.containers.has(OLD_ID)).toBe(false)
  })

  it('waits for a new one already running, then removes the old one', async () => {
    ready({ phase: 'switching', attempts: 1, waitingSince: new Date(clock).toISOString() })
    await docker.stop(OLD_ID)
    await docker.rename(OLD_ID, 'agenthix-host-previous')
    await docker.run({ name: 'agenthix-host', image: STARTED_AS, mounts: [], network: 'host', capAdd: [], env: [], restart: 'unless-stopped', labels: {} })
    docker.calls.length = 0
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'done' })
    expect(ran()).toEqual([])
    expect(docker.containers.has(OLD_ID)).toBe(false)
  })

  it('puts the old one back when launchers keep stopping partway', async () => {
    ready({ phase: 'switching', attempts: 5 })
    await docker.stop(OLD_ID)
    await docker.rename(OLD_ID, 'agenthix-host-previous')
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'failed' })
    expect(host()).toMatchObject({ id: OLD_ID, running: true })
  })

  it('does nothing more once the switch has ended', async () => {
    ready({ phase: 'done', endedAt: new Date(clock).toISOString() })
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'done' })
    expect(docker.calls).toEqual([])
    expect(readSwitch(state)!.phase).toBe('done')
  })
})

describe('a development build switched to an image built on the machine @SC-838 @SC-1274', () => {
  /** What the person named: a local build, by its name. */
  const BUILT = 'agenthix-host:b'

  function built(over: Partial<HostSwitch> = {}): HostSwitch {
    return ready({ from: 'dev', to: 'dev', ref: BUILT, checked: false, built: true, ...over })
  }

  beforeEach(() => {
    env = { ...env, ownVersion: 'dev' }
    docker.refs.set(BUILT, NEW_IMAGE)
  })

  it('starts the new host service by the image’s id, with the recorded settings, and removes the old one once it answers', async () => {
    built()
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'done', reason: null })
    expect(host()).toMatchObject({ image: NEW_IMAGE, reference: NEW_IMAGE, running: true, network: 'host', restart: 'unless-stopped' })
    expect(host()!.env).toContain('TZ=Europe/London')
    expect(docker.containers.has(OLD_ID)).toBe(false)
    expect(docker.calls.filter(c => /^(stop|rename|run) /.test(c))).toEqual([`stop ${OLD_ID}`, `rename ${OLD_ID}`, `run agenthix-host ${NEW_IMAGE}`])
  })

  it('puts the old host service back when the new one never answers', async () => {
    docker.silent.add(NEW_IMAGE)
    built()
    const ended = await runSwitch(env, NEW_IMAGE)
    expect(ended).toMatchObject({ phase: 'failed', reason: expect.stringContaining(`The new host service from ${BUILT} did not answer within 3 minutes`) })
    expect(host()).toMatchObject({ id: OLD_ID, image: OLD_IMAGE, running: true })
    expect([...docker.containers.values()].map(c => c.name)).toEqual(['agenthix-host'])
  })

  it('puts the old one back when the new one answers as a published version', async () => {
    const exec = docker.exec.bind(docker)
    docker.exec = async (name: string, command: string[]) => ({ ...(await exec(name, command)), stdout: '{"version":"0.3.0"}\n' })
    built()
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'failed', reason: expect.stringContaining('answered as 0.3.0, not dev') })
    expect(host()).toMatchObject({ id: OLD_ID, running: true })
  })

  it('is refused by a published host service, which switches only forward to a signed image @SC-1275', async () => {
    built()
    expect(await runSwitch({ ...env, ownVersion: '0.2.0' }, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('0.2.0, a published version') })
    built({ from: '0.2.0' })
    expect(await runSwitch({ ...env, ownVersion: '0.2.0' }, NEW_IMAGE)).toMatchObject({ phase: 'refused' })
    expect(host()).toMatchObject({ id: OLD_ID, running: true })
    expect(ran()).toEqual([])
  })

  it('refuses a published image, by its reference or by where it was fetched from', async () => {
    built({ ref: 'ghcr.io/solution84-com/agenthix-host:0.3.0' })
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('is a published image') })
    docker.images.set(NEW_IMAGE, { ...docker.images.get(NEW_IMAGE)!, repoDigests: [`ghcr.io/solution84-com/agenthix-host@sha256:${'d'.repeat(64)}`] })
    built({ ref: NEW_IMAGE })
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('is a published image') })
    expect(ran()).toEqual([])
  })

  it('refuses the image the host service already runs, and a switch not written for a development build', async () => {
    docker.refs.set(BUILT, OLD_IMAGE)
    built({ imageId: OLD_IMAGE })
    expect(await runSwitch(env, OLD_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('already runs') })
    built({ to: '0.3.0' })
    expect(await runSwitch(env, NEW_IMAGE)).toMatchObject({ phase: 'refused', reason: expect.stringContaining('not written for a development build') })
    expect(ran()).toEqual([])
  })
})
