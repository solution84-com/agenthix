import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StateFolder } from '../../state/folder'
import { mountArg, parseInspect, runArgs } from '../../docker/containers'
import { hostSpec, readRecord, recordHostContainer, shellCommand } from '../record'
import { namesFor } from '../../state/namespace'
import { FakeContainers, NEW_IMAGE, OLD_ID, OLD_IMAGE } from './fakeContainers'

let dir: string
let state: StateFolder
let docker: FakeContainers
const now = new Date('2026-10-14T09:00:00Z')

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-record-'))
  state = new StateFolder(dir)
  state.prepare()
  docker = new FakeContainers()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe("the host service's recorded settings @SC-838", () => {
  it('are read from Docker’s inspect of its own container, less what its image sets', async () => {
    const record = await recordHostContainer(docker, state, now, 'agenthix-host')
    expect(record).toMatchObject({
      containerId: OLD_ID, image: OLD_IMAGE, network: 'host', capAdd: ['NET_ADMIN'], env: ['TZ=Europe/London'], restart: 'unless-stopped',
    })
    expect(readRecord(state)).toEqual(record)
    expect(fs.statSync(state.path('launcher', 'container.json')).mode & 0o777).toBe(0o600)
  })

  it('are not kept when the container has no Docker socket or state folder, or a mount of another kind', async () => {
    const host = docker.byName('agenthix-host')!
    host.mounts = host.mounts!.filter(m => m.destination !== '/var/run/docker.sock')
    expect(await recordHostContainer(docker, state, now, 'agenthix-host')).toEqual({ problem: 'it has no Docker socket mounted at /var/run/docker.sock' })
    host.mounts = null
    expect(await recordHostContainer(docker, state, now, 'agenthix-host')).toMatchObject({ problem: expect.stringContaining('not a folder or a volume') })
    expect(readRecord(state)).toBeNull()
  })

  it('are refused when what is written down is not what Docker would have said', async () => {
    await recordHostContainer(docker, state, now, 'agenthix-host')
    const file = state.path('launcher', 'container.json')
    const written = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const bad of [
      { network: 'host --privileged' },
      { capAdd: ['ALL', 'net_admin'] },
      { mounts: [...written.mounts, { type: 'bind', source: 'relative', destination: '/x', readOnly: false }] },
      { env: ['not a variable'] },
      { restart: 'sometimes' },
    ]) {
      fs.writeFileSync(file, JSON.stringify({ ...written, ...bad }))
      expect(readRecord(state)).toBeNull()
    }
  })

  it('start the same container again from another image', async () => {
    const record = await recordHostContainer(docker, state, now, 'agenthix-host')
    if ('problem' in record) throw new Error(record.problem)
    expect(runArgs(hostSpec(record, NEW_IMAGE, namesFor('agenthix')))).toEqual([
      'run', '-d', '--name', 'agenthix-host', '--restart', 'unless-stopped',
      '--mount', 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock',
      '--mount', 'type=bind,src=/home/sam/.agenthix,dst=/state',
      '--mount', 'type=volume,src=agenthix-host-figures,dst=/run/host-figures',
      '--network', 'host', '--cap-add', 'NET_ADMIN', '-e', 'TZ=Europe/London',
      '--label', 'com.docker.compose.project=agenthix-host', NEW_IMAGE,
    ])
  })
})

describe('the Docker arguments @SC-838', () => {
  it('quote a mount whose folder holds a comma or a quote, as Docker reads them', () => {
    expect(mountArg({ type: 'bind', source: '/Users/sam/My, "data"', destination: '/state', readOnly: true }))
      .toBe('type=bind,"src=/Users/sam/My, ""data""",dst=/state,readonly')
  })

  it('are printed for a shell with anything unusual quoted', () => {
    expect(shellCommand(['run', '-e', 'TZ=Europe/London', '--mount', 'type=bind,src=/Users/sam/My data,dst=/state']))
      .toBe("docker run -e TZ=Europe/London --mount 'type=bind,src=/Users/sam/My data,dst=/state'")
  })

  it('read an inspected container’s settings, and say when a mount is not one it starts', () => {
    const c = parseInspect({
      Id: OLD_ID, Name: '/host', Image: OLD_IMAGE, State: { Running: true }, Config: { Env: ['TZ=UTC'] },
      HostConfig: { NetworkMode: 'host', CapAdd: ['NET_ADMIN'], RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 } },
      Mounts: [{ Type: 'volume', Name: 'figures', Destination: '/run/host-figures', RW: true }, { Type: 'tmpfs', Destination: '/tmp' }],
    })
    expect(c).toMatchObject({ name: 'host', running: true, restart: 'on-failure:3', mounts: null })
  })
})
