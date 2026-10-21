import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Docker, type DockerRunner, type RunResult } from '../../docker/docker'
import { HqControl, type HqCommandResult } from '../../hq/control'
import { machineStatus, type Installed } from '../machineStatus'
import { parseSiteReport, siteContainerOf } from '../siteControl'

// The default site's cause, read from the site and passed on to hq (host-management spec §10).

let dir: string
let calls: string[][]
let hqAnswers: Record<string, HqCommandResult>
let siteSays: unknown

const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' })
const run: DockerRunner = async (args, options) => {
  calls.push(args)
  if (args[0] === 'compose' && args.includes('ps')) {
    const services = args[args.indexOf('-p') + 1].endsWith('-hq') ? ['hq-db', 'hq-server', 'hq-web'] : ['site-db', 'site']
    return ok(services.map(s => JSON.stringify({ Service: s, State: 'running', Health: '' })).join('\n'))
  }
  if (args[0] === 'exec' && args[2] === 'ns-hq-server') {
    const command = args[args.indexOf('-') + 1]
    const answer = hqAnswers[command] ?? { ok: true, text: 'ok', data: {} }
    return ok(`${JSON.stringify(answer)}\n`)
  }
  if (args[0] === 'exec' && args[2] === 'ns-site') {
    expect(options?.input).toContain("command: 'status'")
    return siteSays === null ? { code: 3, stdout: '', stderr: '' } : ok(`${JSON.stringify(siteSays)}\n`)
  }
  return { code: 1, stdout: '', stderr: `unexpected ${args.join(' ')}` }
}

const hqStatus = (state: string, cause: string | null = null): HqCommandResult => ({
  ok: true, text: 'HQ',
  data: { users: 2, runningAgents: 1, hqSite: { state, dockerRunning: true, cause }, address: 'https://hq.acme.example', version: '0.2.0', commit: 'c' },
})
const siteStatus = (problem: string | null, connected = false) => ({
  type: 'status', status: { siteId: 's', name: 'hq-box', pairedBySecret: true, problem, hq: { url: 'http://ns-hq-web:4100', connected } },
})

function installed(): Installed {
  const siteFile = path.join(dir, 'site.json')
  fs.writeFileSync(siteFile, JSON.stringify({ services: { site: { container_name: 'ns-site' } } }))
  return {
    hq: { settings: { address: 'https://hq.acme.example', bind: '127.0.0.1', port: 4100, trustedProxies: 1, version: '0.2.0', installedAt: 'x' }, file: path.join(dir, 'hq.json'), project: 'ns-hq' },
    site: { settings: { name: 'hq-box', version: '0.2.0', installedAt: 'x' }, file: siteFile, project: 'ns-site' },
  }
}

const status = () => {
  const docker = new Docker(run)
  return machineStatus({ name: 'hq-box', hostServiceVersion: '0.2.0' }, installed(), docker, new HqControl(docker, 'ns-hq-server'))
}
const causesSent = () => calls.filter(c => c.includes('default-site-cause')).map(c => c[c.length - 1])

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-status-'))
  calls = []
  hqAnswers = { status: hqStatus('notConnected') }
  siteSays = siteStatus('credentialRefused')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('machine status and the default site\'s cause @SC-822', () => {
  it('reads the cause from the site, passes it on to hq, and names it', async () => {
    const s = await status()
    expect(s.site).toMatchObject({ connection: 'notConnected', cause: 'credentialRefused' })
    expect(causesSent()).toEqual(['credentialRefused'])
    expect(s.hq?.answer).toEqual({ users: 2, runningAgents: 1 })
  })

  it('does not pass on what hq already holds', async () => {
    hqAnswers = { status: hqStatus('notConnected', 'credentialRefused') }
    await status()
    expect(causesSent()).toEqual([])
  })

  it('asks the site nothing while hq sees it connected', async () => {
    hqAnswers = { status: hqStatus('connected') }
    const s = await status()
    expect(s.site?.cause).toBeNull()
    expect(calls.some(c => c[0] === 'exec' && c[2] === 'ns-site')).toBe(false)
  })

  it('falls back to what hq holds when the site does not answer', async () => {
    hqAnswers = { status: hqStatus('notConnected', 'unreachable') }
    siteSays = null
    expect((await status()).site?.cause).toBe('unreachable')
    expect(causesSent()).toEqual([])
  })

  it('takes the site\'s own word on a machine where hq does not run', async () => {
    const docker = new Docker(run)
    const siteOnly = () => machineStatus({ name: 'office', hostServiceVersion: '0.2.0' }, { ...installed(), hq: null }, docker, new HqControl(docker, 'ns-hq-server'))
    siteSays = siteStatus(null, true)
    expect((await siteOnly()).site).toMatchObject({ connection: 'connected', cause: null })
    siteSays = siteStatus('unreachable')
    expect((await siteOnly()).site).toMatchObject({ connection: 'notConnected', cause: 'unreachable' })
    siteSays = null
    expect((await siteOnly()).site).toMatchObject({ connection: 'unknown' })
  })

  it('passes on nothing that is not a cause from the closed set', async () => {
    siteSays = siteStatus('rm -rf /')
    expect((await status()).site?.cause).toBeNull()
    expect(causesSent()).toEqual([])
  })
})

describe('reading the site\'s answer @SC-822', () => {
  it('takes only the cause, and none while connected', () => {
    expect(parseSiteReport(JSON.stringify(siteStatus('unreachable')))).toEqual({ connected: false, cause: 'unreachable', moving: null, replacedAt: null })
    expect(parseSiteReport(JSON.stringify(siteStatus('unreachable', true)))).toEqual({ connected: true, cause: null, moving: null, replacedAt: null })
    for (const junk of ['', 'not json', '{"type":"error","message":"x"}', JSON.stringify({ ok: true, text: 'HQ' })]) {
      expect(parseSiteReport(junk)).toBeNull()
    }
  })

  it('takes the time HQ said a restore onto another machine replaced the site, and only a time', () => {
    const replaced = (at: unknown, connected = false) => JSON.stringify({
      type: 'status', status: { problem: 'credentialRefused', hq: { url: 'http://192.168.1.20:4100', connected }, replaced: { at } },
    })
    expect(parseSiteReport(replaced('2026-10-15T09:33:00.000Z'))?.replacedAt).toBe('2026-10-15T09:33:00.000Z')
    expect(parseSiteReport(replaced('$(reboot)'))?.replacedAt).toBeNull()
    expect(parseSiteReport(replaced('2026-10-15T09:33:00.000Z', true))?.replacedAt).toBeNull()
  })

  it('takes a move the site waits on, but only addresses and a time', () => {
    const moving = (to: unknown, since: unknown) => JSON.stringify({
      type: 'status', status: { problem: 'unreachable', hq: { url: 'http://192.168.1.20:4100', connected: false }, moving: { to, since } },
    })
    expect(parseSiteReport(moving('http://192.168.1.30:4100', '2026-10-14T09:12:00.000Z'))?.moving)
      .toEqual({ from: 'http://192.168.1.20:4100', to: 'http://192.168.1.30:4100', since: '2026-10-14T09:12:00.000Z' })
    expect(parseSiteReport(moving('$(reboot)', '2026-10-14T09:12:00.000Z'))?.moving).toBeNull()
    expect(parseSiteReport(moving('http://192.168.1.30:4100', 'soon'))?.moving).toBeNull()
  })

  it('finds the site\'s container in the compose project, refusing a name Docker would not give', () => {
    const file = path.join(dir, 'p.json')
    fs.writeFileSync(file, JSON.stringify({ services: { site: { container_name: 'ns-site' } } }))
    expect(siteContainerOf(file)).toBe('ns-site')
    fs.writeFileSync(file, JSON.stringify({ services: { site: { container_name: '--privileged' } } }))
    expect(siteContainerOf(file)).toBeNull()
    expect(siteContainerOf(path.join(dir, 'missing.json'))).toBeNull()
  })
})
