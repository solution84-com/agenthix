/**
 * Erase and restore from the bin against a real Docker (`npm run test:container`, with HOST_E2E=1). Build the host
 * service's image first, at the repository root: `docker build -f host/docker/Dockerfile -t agenthix-host .` (or
 * name another with HOST_IMAGE). Like the backups' end-to-end test it needs the images a development build
 * installs. HQ is installed at http://localhost on a free port the test chooses, and the Fleet Console beside it
 * publishes 127.0.0.1 on another, so it runs beside an installation.
 *
 * It installs HQ and its site, suspends and resumes them, erases them at once with a backup location set, checks
 * that nothing of theirs is left running or stored but the bin and the location's copy, brings them back from the
 * bin, and checks HQ answers again. Everything it makes carries a namespace of its own for the run, recorded in the
 * state folder so the host service names everything from it, and every docker command goes through the guard
 * (`containerGuard.ts`): a real install on the machine is never touched, and teardown removes only that namespace's.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { claimNames, guardedDocker, freePorts, recordNamespace, testNamespace } from '../../__tests__/containerGuard'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('erase')
const NAMES = claimNames(NS)
const [HQ_PORT, CONSOLE_PORT] = await freePorts(2)
const HQ_ADDRESS = `http://localhost:${HQ_PORT}`
const docker = guardedDocker(NS)
const cli = (input: string, ...args: string[]) => docker.with({ input }, 'exec', '-i', NAMES.hostContainer, 'agenthix', ...args)
const ours = (kind: 'volume' | 'container') =>
  (kind === 'volume' ? docker('volume', 'ls', '--format', '{{.Name}}') : docker('ps', '-a', '--format', '{{.Names}}'))
    .split('\n').filter(n => n.startsWith(`${NAMES.hqProject}-`) || n.startsWith(`${NAMES.siteProject}-`))

describe.skipIf(!process.env.HOST_E2E)('HQ suspended, resumed, erased and brought back from the bin', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-erase-'))
  const state = path.join(tmp, 'state')
  const location = path.join(tmp, 'nas')

  afterAll(() => {
    docker.quiet('rm', '-f', NAMES.hostContainer)
    // HQ's project last: the site and the Fleet Console join its link network, which goes with it.
    for (const p of [NAMES.siteProject, NAMES.consoleProject, NAMES.hqProject]) docker.quiet('compose', '-p', p, 'down', '-v')
    docker.quiet('volume', 'rm', NAMES.hostFiguresVolume)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('erases at once, keeps the final backup in the bin and the location, and restores from the bin @SC-843', async () => {
    fs.mkdirSync(state)
    fs.mkdirSync(location)
    recordNamespace(state, NS)
    docker('run', '-d', '--name', NAMES.hostContainer, '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', `${state}:/state`,
      '-v', `${location}:${location}`, '-v', `${NAMES.hostFiguresVolume}:/run/host-figures`, '--network', 'host', IMAGE)
    await new Promise(r => setTimeout(r, 3000))
    cli('', 'install', '--address', HQ_ADDRESS, '--console-port', String(CONSOLE_PORT), '--yes')
    cli('n\ny\n', 'backup', 'location', location)

    expect(cli('', 'hq', 'suspend')).toContain('Suspended.')
    expect(cli('', 'status')).toContain('Suspended. Nothing is lost')
    expect(cli('', 'hq', 'resume')).toContain('Resumed.')

    const erased = cli(`${HQ_ADDRESS}\n`, 'hq', 'erase')
    expect(erased).toMatch(/Taking the final sealed backup \.+ done/)
    expect(erased).toContain('Erased. The backup is kept until')
    expect(ours('container')).toEqual([])
    expect(ours('volume')).toEqual([])
    expect(fs.existsSync(path.join(state, 'site'))).toBe(false)
    expect(fs.readdirSync(path.join(state, 'bin')).filter(f => f.endsWith('.sealed'))).toHaveLength(1)
    expect(fs.readdirSync(location).filter(f => f.endsWith('.sealed')).length).toBeGreaterThanOrEqual(1)
    expect(cli('', 'status')).toContain('was erased on')

    const restored = cli('y\n', 'hq', 'restore')
    expect(restored).toContain(`Restored. HQ answers at ${HQ_ADDRESS}`)
    expect(cli('', 'status')).toMatch(/Running\./)
    expect(fs.readdirSync(path.join(state, 'bin')).filter(f => f.endsWith('.sealed'))).toEqual([])
  }, 30 * 60_000)
})
