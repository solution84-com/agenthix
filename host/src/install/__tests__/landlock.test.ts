import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import type { Progress } from '../../sockets/lineServer'
import { install } from '../install'
import { installManagedSite } from '../managedSite'
import { KERNEL_STEP } from '../landlock'
import { installed } from '../../service/context'
import { connectConsole } from '../../link/manage'
import { readPin, type ConsolePin } from '../../link/pin'
import { upgrade } from '../../upgrades/upgrade'
import { readUpgrades } from '../../upgrades/settings'
import { BackupStore } from '../../backups/store'
import { kernelRefusal } from '../../cli/messages'
import { Refusal } from '../../owner/results'
import { DEVELOPMENT } from '../../images/ownVersion'
import '../../upgrades/operations'

const REGISTRY = 'ghcr.io/solution84-com'
const agentPinned = (v: string) => `${REGISTRY}/agenthix-agent@${digestOf(`${REGISTRY}/agenthix-agent:${v}`)}`

let m: FakeMachine
let progress: Progress[]
beforeEach(() => {
  m = fakeMachine()
  progress = []
})
afterEach(() => m.cleanup())

const report = (p: Progress) => progress.push(p)
/** The image each Landlock probe ran, in order. */
const probed = () => m.calls.filter(c => c[0] === 'run' && c[c.length - 1] === '--abi').map(c => c[c.length - 3])
/** What started, stopped or was written to Docker: anything a refusal must not have done. */
const changes = () => m.calls.filter(c => c[0] === 'compose' && !c.includes('ps') && !c.includes('logs'))
const kernel = (stdout: string, code = 0) => { m.landlock.stdout = stdout; m.landlock.code = code }

/** ABI 4 (Ubuntu 24.04's own 6.8 kernel), no Landlock at all, and an answer that cannot be read. */
const REFUSED: [string, () => void][] = [
  ['ABI 4', () => kernel('4\n')],
  ['no Landlock (0)', () => kernel('0\n')],
  ['an unreadable answer', () => kernel('agenthix-contain: unknown option --abi\n', 2)],
]
const PASSES: [string, () => void][] = [['ABI 6', () => kernel('6\n')], ['ABI 8', () => kernel('8\n')]]

const refusal = (p: Promise<unknown>) => p.then(() => { throw new Error('not refused') }, (e: unknown) => e as Refusal)

describe('install refuses where agents cannot work @SC-2184', () => {
  const run = () => install(m.ctx, { address: 'https://hq.acme.example' }, report)

  for (const [what, set] of REFUSED) {
    it(`on ${what}, changing nothing, once the images are checked`, async () => {
      set()
      const e = await refusal(run())
      expect(e).toBeInstanceOf(Refusal)
      expect(e.message).toMatch(/^Agenthix was not installed: this machine's kernel \(Linux 6\.12\.48\+deb13-amd64, Debian GNU\/Linux 13 \(trixie\)\)/)
      expect(e.message).toContain('Nothing was changed.')
      expect(probed()).toEqual([agentPinned('0.2.0')])
      expect(m.checked.length).toBeGreaterThan(0)
      expect(changes()).toEqual([])
      expect(installed(m.ctx).hq).toBeFalsy()
      for (const f of [['hq', 'settings.json'], ['site', 'settings.json'], ['secrets.json']]) expect(fs.existsSync(m.ctx.state.path(...f))).toBe(false)
    })
  }

  for (const [what, set] of PASSES) {
    it(`goes ahead on ${what}`, async () => {
      set()
      await expect(run()).resolves.toMatchObject({ siteName: 'hq-box' })
      expect(progress).toContainEqual({ event: 'step', step: KERNEL_STEP })
    })
  }

  it('on a development build, asks the agent image built here under the tag', async () => {
    m.ctx.machine.hostServiceVersion = 'dev'
    for (const part of ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'executor', 'console']) {
      const id = `sha256:${part.length.toString().padStart(64, '0')}`
      m.containers.images.set(id, { id, env: [], repoDigests: [] })
      m.containers.refs.set(`agenthix-${part}:rc`, id)
    }
    kernel('5\n')
    const e = await refusal(install(m.ctx, { address: 'http://127.0.0.1:7820', hqPort: 7820, consolePort: 7821, imageTag: 'rc' }, report))
    expect(e.message).toContain('It has Landlock 5.')
    expect(probed()).toEqual(['agenthix-agent:rc'])
    expect(changes()).toEqual([])
  })
})

describe('a machine joining a Fleet Console refuses where agents cannot work @SC-2185', () => {
  let dialled: number
  beforeEach(() => {
    dialled = 0
    const dial = m.ctx.dial!
    m.ctx.dial = (...args) => { dialled++; return dial(...args) }
  })
  const connect = () => connectConsole(m.ctx, 'https://hq.acme.example', '7KQ4-M2XD-46Q3', report)

  for (const [what, set] of REFUSED) {
    it(`on ${what}, before it is offered to the Fleet Console`, async () => {
      set()
      const e = await refusal(connect())
      expect(e.message).toMatch(/^This machine was not connected to a Fleet Console: /)
      expect(probed()).toEqual([agentPinned('0.2.0')])
      expect(dialled).toBe(0)
      expect(readPin(m.ctx.state)).toBeNull()
      expect(changes()).toEqual([])
    })
  }

  for (const [what, set] of PASSES) {
    it(`goes on to HQ on ${what}`, async () => {
      set()
      // Nothing answers on the fake relay, so the join itself ends there.
      await expect(connect()).rejects.toThrow('that code has expired or was already used')
      expect(dialled).toBe(1)
    })
  }
})

describe('the site a Fleet Console starts refuses where agents cannot work @SC-2184', () => {
  const pin = { local: false, hqAddress: 'https://hq.acme.example' } as ConsolePin
  const add = () => installManagedSite(m.ctx, { version: '0.2.0' }, pin, report)

  for (const [what, set] of REFUSED) {
    it(`on ${what}, changing nothing`, async () => {
      set()
      await expect(add()).rejects.toThrow(/^Agenthix was not installed: /)
      expect(changes()).toEqual([])
      expect(installed(m.ctx).site).toBeFalsy()
    })
  }

  for (const [what, set] of PASSES) {
    it(`starts it on ${what}`, async () => {
      set()
      await expect(add()).resolves.toMatchObject({ state: 'started' })
    })
  }
})

describe('every upgrade refuses where its agents could not work @SC-2186', () => {
  /** Upgrades `target` to 0.2.1 from what `setUp` installed; the first install passed on ABI 8. */
  async function upgradeTo(target: 'hq' | 'site', setUp: () => Promise<unknown>) {
    await setUp()
    m.calls.length = 0
    return upgrade(m.ctx, target, '0.2.1', report)
  }
  const onHqMachine = () => install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  const onSiteMachine = () => installManagedSite(m.ctx, { version: '0.2.0' }, { local: false, hqAddress: 'https://hq.acme.example' } as ConsolePin, () => {})

  for (const [target, setUp] of [['hq', onHqMachine], ['site', onSiteMachine]] as const) {
    for (const [what, set] of REFUSED) {
      it(`of ${target} on ${what}: nothing stops, is backed up or is started`, async () => {
        await setUp()
        set()
        m.calls.length = 0
        const e = await refusal(upgrade(m.ctx, target, '0.2.1', report))
        expect(e.message).toMatch(/^Not upgraded: /)
        expect(probed()).toEqual([agentPinned('0.2.1')])
        expect(changes()).toEqual([])
        expect(installed(m.ctx)[target]!.settings.version).toBe('0.2.0')
        expect(readUpgrades(m.ctx.state)).toMatchObject({ underWay: null, stopping: null })
        expect(await new BackupStore(m.ctx.state).list()).toEqual([])
      })
    }

    for (const [what, set] of PASSES) {
      it(`of ${target} goes ahead on ${what}`, async () => {
        set()
        await upgradeTo(target, setUp).catch(() => {})
        expect(progress).toContainEqual({ event: 'stepDone', outcome: 'passes' })
        expect(probed()).toEqual([agentPinned('0.2.1')])
        expect(m.calls.some(c => c[0] === 'compose' && c.includes('stop'))).toBe(true)
      })
    }
  }

  it('to images built here under a tag, asks that tag’s agent image', async () => {
    m.ctx.machine.hostServiceVersion = 'dev'
    let n = 1
    for (const tag of ['from', 'to']) {
      for (const part of ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'executor', 'console']) {
        const id = `sha256:${String(n++).padStart(64, '0')}`
        m.containers.images.set(id, { id, env: [], repoDigests: [] })
        m.containers.refs.set(`agenthix-${part}:${tag}`, id)
      }
    }
    await install(m.ctx, { address: 'http://127.0.0.1:7820', hqPort: 7820, consolePort: 7821, imageTag: 'from' }, () => {})
    kernel('0\n')
    m.calls.length = 0
    await expect(upgrade(m.ctx, 'hq', DEVELOPMENT, report, { built: 'to' })).rejects.toThrow('It has no Landlock.')
    expect(probed()).toEqual(['agenthix-agent:to'])
    expect(changes()).toEqual([])
  })
})

describe("the refusal's words @SC-2187", () => {
  const words = (system: string, abi: number | null = 4, kernelRelease = '6.8.0-48-generic') =>
    kernelRefusal({ for: 'install', abi, kernel: kernelRelease, system })

  it('say why, what was found, and the fix for the system found', () => {
    expect(words('Ubuntu 24.04.1 LTS')).toBe(
      "Agenthix was not installed: this machine's kernel (Linux 6.8.0-48-generic, Ubuntu 24.04.1 LTS) cannot keep agents' commands " +
      "contained, so no agent could work here. It has Landlock 4. Agents' commands are contained with the kernel's Landlock 6, which " +
      "Linux 6.12 and newer have. Nothing was changed. To fix it, install Ubuntu 24.04's newer kernel " +
      '(sudo apt install linux-generic-hwe-24.04), restart the machine, then run this again.',
    )
    expect(words('Debian GNU/Linux 12 (bookworm)', 0, '6.1.0-26-amd64')).toContain(
      "It has no Landlock. Agents' commands are contained with the kernel's Landlock 6, which Linux 6.12 and newer have. Nothing was changed. " +
      "To fix it, install Debian 12's newer kernel from bookworm-backports (with backports in apt's sources: " +
      'sudo apt install -t bookworm-backports linux-image-amd64, or linux-image-arm64 on ARM), restart the machine, then run this again.',
    )
    expect(words('Docker Desktop', 5, '6.10.14-linuxkit')).toContain('To fix it, update Docker Desktop, which brings its own kernel, then run this again.')
    expect(words('Rocky Linux 9.4 (Blue Onyx)', 3, '5.14.0-427.el9.x86_64')).toContain(
      'To fix it, install a kernel of Linux 6.12 or newer (Debian 13 has one), restart the machine, then run this again.')
  })

  it('give the fix for an unreadable answer on an old kernel, and ask again on a new one', () => {
    expect(words('Ubuntu 24.04.1 LTS', null)).toContain("could not be asked whether it can keep agents' commands contained")
    expect(words('Ubuntu 24.04.1 LTS', null)).toContain('linux-generic-hwe-24.04')
    expect(words('Ubuntu 24.04.1 LTS', null, '6.14.0-29-generic')).toContain(
      'Run this again; if it is refused again, the agent image\'s answer is the problem: docker run --rm <the agent image> /usr/local/lib/agenthix/bin/agenthix-contain --abi prints it.')
  })

  it('name what each check stopped', () => {
    expect(kernelRefusal({ for: 'connect', abi: 4, kernel: '6.8.0', system: '' })).toMatch(/^This machine was not connected to a Fleet Console: this machine's kernel \(Linux 6\.8\.0\)/)
    expect(kernelRefusal({ for: 'upgrade', abi: 4, kernel: '', system: '' })).toMatch(/^Not upgraded: this machine's kernel \(Linux of a version Docker did not say\)/)
  })
})
