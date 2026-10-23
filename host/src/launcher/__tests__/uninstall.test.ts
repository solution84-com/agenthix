import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { namesFor } from '../../state/namespace'
import type { Removal } from '../../docker/removal'
import type { HostContainerRecord } from '../record'
import { helperSpec, parseHelperArgs, runHelper, type HelperEnv } from '../uninstall'

const names = namesFor('agenthix')
const record: HostContainerRecord = {
  containerId: 'c'.repeat(64), image: `sha256:${'a'.repeat(64)}`, network: 'host', capAdd: ['NET_ADMIN'], restart: 'unless-stopped',
  env: ['TZ=Europe/London', 'REGISTRY_TOKEN=secret'], recordedAt: '2026-10-21T09:00:00Z',
  mounts: [
    { type: 'bind', source: '/var/run/docker.sock', destination: '/var/run/docker.sock', readOnly: false },
    { type: 'bind', source: '/home/sam/.agenthix', destination: '/state', readOnly: false },
    { type: 'volume', name: 'agenthix-host-figures', destination: '/run/host-figures', readOnly: false },
  ],
}

describe("the uninstall's helper container @SC-1162", () => {
  it("runs from the host service's own image with the Docker socket and the state folder only, no network, never restarted", () => {
    expect(helperSpec(record, names)).toEqual({
      name: 'agenthix-host-uninstall',
      labels: { 'com.docker.compose.project': 'agenthix-host' },
      image: record.image,
      mounts: [
        { type: 'bind', source: '/var/run/docker.sock', destination: '/var/run/docker.sock', readOnly: false },
        { type: 'bind', source: '/home/sam/.agenthix', destination: '/machine-state', readOnly: false },
      ],
      network: 'none', capAdd: [], env: ['TZ=Europe/London'], restart: 'no',
      command: ['node', '--enable-source-maps', '/app/dist/launcher.js', 'uninstall', 'agenthix', '.agenthix'],
    })
  })

  it('is given no folder when the state folder is a volume, or the machine’s root', () => {
    for (const state of [{ type: 'volume', name: 'agenthix-state' }, { type: 'bind', source: '/' }] as const) {
      const r = { ...record, mounts: [record.mounts[0], { ...state, destination: '/state', readOnly: false }] } as HostContainerRecord
      const spec = helperSpec(r, names)
      expect(spec.mounts).toHaveLength(1)
      expect(spec.command?.slice(-2)).toEqual(['uninstall', 'agenthix'])
    }
  })

  it('takes only a namespace and a folder name, never a path', () => {
    expect(parseHelperArgs(['agenthix', '.agenthix'])).toEqual({ namespace: 'agenthix', folder: '.agenthix' })
    expect(parseHelperArgs(['agenthix'])).toEqual({ namespace: 'agenthix', folder: null })
    for (const bad of [[], ['Agenthix'], ['agenthix', '../etc'], ['agenthix', '..'], ['agenthix', 'a/b'], ['agenthix', 'x', 'y']]) {
      expect(parseHelperArgs(bad)).toBeNull()
    }
  })
})

describe('what the helper removes @SC-1162', () => {
  let parent: string
  let removed: string[]
  let failing: Set<string>
  let env: HelperEnv
  const removeAs = (kind: string) => async (name: string): Promise<Removal> => {
    if (failing.has(name)) throw new Error('the daemon refused')
    removed.push(`${kind} ${name}`)
    return 'removed'
  }

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'host-helper-'))
    fs.mkdirSync(path.join(parent, '.agenthix', 'backups'), { recursive: true })
    fs.mkdirSync(path.join(parent, '.agenthix', 'site', 'data'), { recursive: true })
    fs.writeFileSync(path.join(parent, '.agenthix', 'site', 'data', 'workspace.txt'), 'work')
    for (const f of ['installation.json', 'secrets.json', 'machine.json', 'scheduled.json', `secrets.json.${process.pid}.tmp`]) {
      fs.writeFileSync(path.join(parent, '.agenthix', f), f === 'installation.json' ? JSON.stringify({ namespace: 'agenthix' }) : '{}')
    }
    fs.writeFileSync(path.join(parent, 'beside.txt'), 'the person’s own')
    removed = []
    failing = new Set()
    env = {
      names, folder: '.agenthix', stateDir: path.join(parent, '.agenthix'),
      remove: { container: removeAs('container'), volume: removeAs('volume') },
      sleep: async () => {}, log: () => {},
    }
  })
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }))

  it("the host service's container, then its volume, then what is in the state folder, which it leaves empty", async () => {
    expect(await runHelper(env)).toEqual([])
    expect(removed).toEqual(['container agenthix-host', 'volume agenthix-host-figures'])
    // Only the folder itself is mounted, so the helper cannot remove it: the person removes the empty folder.
    expect(fs.readdirSync(path.join(parent, '.agenthix'))).toEqual([])
    expect(fs.readdirSync(parent).sort()).toEqual(['.agenthix', 'beside.txt'])
  })

  it('touches nothing in a folder that holds anything the host service did not write, not even the names it does', async () => {
    fs.writeFileSync(path.join(parent, '.agenthix', 'thesis.docx'), 'the person’s own')
    fs.writeFileSync(path.join(parent, '.agenthix', 'backups', 'tax-2025.pdf'), 'the person’s own')
    const before = fs.readdirSync(path.join(parent, '.agenthix')).sort()
    expect(await runHelper(env)).toEqual([
      'what is in the state folder .agenthix: it holds thesis.docx, which Agenthix did not write, so nothing in it was removed. ' +
        'Once you have checked what it holds, you can delete it yourself',
    ])
    expect(fs.readdirSync(path.join(parent, '.agenthix')).sort()).toEqual(before)
    expect(fs.existsSync(path.join(parent, '.agenthix', 'backups', 'tax-2025.pdf'))).toBe(true)
    expect(fs.existsSync(path.join(parent, '.agenthix', 'secrets.json'))).toBe(true)
  })

  it('leaves a folder that does not record this install’s namespace, and says so', async () => {
    fs.writeFileSync(path.join(parent, '.agenthix', 'installation.json'), JSON.stringify({ namespace: 'other' }))
    expect(await runHelper(env)).toEqual(['what is in the state folder .agenthix: it does not record the namespace agenthix, so it was left'])
    expect(fs.existsSync(path.join(parent, '.agenthix'))).toBe(true)
  })

  it('carries on past a removal that fails, says what was left, and finds nothing to fail on a second time', async () => {
    failing.add('agenthix-host')
    expect(await runHelper(env)).toEqual(["the host service's container agenthix-host: the daemon refused"])
    expect(removed).toEqual(['volume agenthix-host-figures'])
    failing.clear()
    expect(await runHelper(env)).toEqual([])
  })
})
