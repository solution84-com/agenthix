/**
 * The host service's image against a real Docker (`npm run test:container`). Build it first, at the repository
 * root: `docker build -f host/docker/Dockerfile -t agenthix-host .` (or name another with HOST_IMAGE). It starts
 * the image with a temporary state folder, its own figures volume and no Docker socket, so it installs nothing. Its
 * container and volume carry a namespace of its own for the run, recorded in the state folder, and every docker
 * command goes through the guard (`containerGuard.ts`): it can run beside a real install and touch none of it.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimNames, guardedDocker, recordNamespace, testNamespace } from './containerGuard'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('image')
const NAMES = claimNames(NS)
const NAME = NAMES.hostContainer
const VOLUME = NAMES.hostFiguresVolume
let state: string

const docker = guardedDocker(NS)
const exec = (...args: string[]) => docker('exec', NAME, ...args)

/** Asks the figures socket from another container that mounts the volume read-only, as the site does. */
const READER = `
const c = require('node:net').createConnection('/run/host-figures/figures.sock')
let got = ''
c.on('connect', () => c.write(process.argv[1] + '\\n'))
c.on('data', d => { got += d })
c.on('close', () => process.stdout.write(got))
`
function askFromSite(request: unknown): Record<string, unknown> {
  const out = docker('run', '--rm', '-v', `${VOLUME}:/run/host-figures:ro`, '--entrypoint', 'node', IMAGE, '-e', READER, JSON.stringify(request))
  return JSON.parse(out.trim().split('\n').pop() ?? '{}')
}

beforeAll(async () => {
  state = fs.mkdtempSync(path.join(os.tmpdir(), 'host-state-'))
  recordNamespace(state, NS)
  docker('volume', 'create', VOLUME)
  docker('run', '-d', '--name', NAME, '-v', `${state}:/state`, '-v', `${VOLUME}:/run/host-figures`, IMAGE)
  for (let i = 0; i < 50; i++) {
    try {
      exec('test', '-S', '/run/host-figures/figures.sock')
      break
    } catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
})

afterAll(() => {
  // What the service wrote belongs to root on a Linux machine, so it is removed from inside.
  docker.quiet('exec', NAME, 'sh', '-c', 'rm -rf /state/* /state/.[!.]*')
  docker.quiet('rm', '-f', NAME)
  docker.quiet('volume', 'rm', VOLUME)
  fs.rmSync(state, { recursive: true, force: true })
})

describe('the host service image', () => {
  it('keeps the installation recorded in the state folder before its first start', () => {
    expect(JSON.parse(fs.readFileSync(path.join(state, 'installation.json'), 'utf8')).namespace).toBe(NS)
  })

  it('keeps the owner socket inside the container, private, and the figures socket in its volume', () => {
    expect(exec('stat', '-c', '%a', '/run/host/owner.sock').trim()).toBe('600')
    expect(exec('stat', '-c', '%a', '/run/host-figures/figures.sock').trim()).toBe('666')
    expect(exec('stat', '-c', '%a', '/run/host-figures').trim()).toBe('755')
    expect(fs.existsSync(path.join(state, 'figures'))).toBe(false)
  })

  it('gives the figures to a container that mounts the volume read-only, as the site does', () => {
    const answer = askFromSite({ op: 'figures.read' })
    expect(answer).toMatchObject({ ok: true, op: 'figures.read' })
    expect((answer.result as { machine: { hostServiceVersion: string } }).machine.hostServiceVersion).toBeTruthy()
  })

  it('refuses that container anything but the figures', () => {
    expect(askFromSite({ op: 'stop', target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'unknown_operation' } })
  })

  it('carries the CLI as its command, named from the branding module, and the docker compose plugin @SC-823', () => {
    expect(exec('agenthix', 'help')).toContain('hq invite-admin')
    expect(exec('docker', 'compose', 'version')).toMatch(/Docker Compose/)
  })

  it('carries cosign, to check each image’s signature before it fetches it @SC-820', () => {
    expect(exec('cosign', 'version')).toMatch(/v3\.1\.3/)
  })

  it('answers agenthix status on a machine with nothing installed', () => {
    expect(exec('agenthix', 'status')).toContain('Nothing runs here yet.')
  })

  it('refuses to install without the state folder’s place on the machine, saying why @SC-817', () => {
    let out = ''
    try {
      exec('agenthix', 'install', '--address', 'https://hq.example.test')
    } catch (err) {
      out = String((err as { stderr?: string }).stderr ?? '')
    }
    expect(out).toMatch(/state folder/)
  })
})
