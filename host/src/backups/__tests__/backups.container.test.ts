/**
 * Backups against a real Docker (`npm run test:container`). Build the host service's image first, at the
 * repository root: `docker build -f host/docker/Dockerfile -t agenthix-host .` (or name another with HOST_IMAGE).
 *
 * The first part checks each Docker action a backup and a restore take — a database dumped and restored, a volume
 * and a folder read and written whole, a folder the machine admin names — with the host service's image as the
 * helper and the pinned postgres image, sealed and opened on the way.
 *
 * The second part, with HOST_E2E=1, backs up a real HQ and its site and restores them on a fresh state folder: it
 * needs the images a development build installs (hq-server, hq-web, site-server, agent and executor, built on the machine).
 * HQ is installed at http://localhost on a free port the test chooses, and the Fleet Console beside it publishes
 * 127.0.0.1 on another, so it runs beside an installation.
 *
 * Everything either part makes carries a namespace of its own for the run, recorded in each state folder so the host
 * service names everything from it, and every docker command goes through the guard (`containerGuard.ts`): a real
 * install on the machine is never touched, and teardown removes only that namespace's compose projects and volumes.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DockerStreams, dockerCli, dockerStream } from '../../docker/docker'
import { POSTGRES_IMAGE } from '../../images/published'
import { claimNames, guarded, guardedDocker, freePorts, recordNamespace, testNamespace } from '../../__tests__/containerGuard'
import { eachPart } from '../parts'
import { holderFrom, newHeader, openBackup, sealBackup, type SealedRecord } from '../seal'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('backups')
const NAMES = claimNames(NS)
const [HQ_PORT, CONSOLE_PORT] = await freePorts(2)
const HQ_ADDRESS = `http://localhost:${HQ_PORT}`
const HELPER = `${NS}-helper`
const DB = `${NS}-db`
const docker = guardedDocker(NS)
const psql = (sql: string) => docker('exec', DB, 'psql', '-U', 'postgres', '-d', 'app', '-tAc', sql).trim()

let tmp: string
let d: DockerStreams

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-backups-'))
  docker('run', '-d', '--name', HELPER, '--entrypoint', 'sleep', IMAGE, '3600')
  docker('run', '-d', '--name', DB, '-e', 'POSTGRES_PASSWORD=x', '-e', 'POSTGRES_DB=app', POSTGRES_IMAGE)
  for (let i = 0; i < 60; i++) {
    try {
      docker('exec', DB, 'pg_isready', '-U', 'postgres', '-d', 'app')
      psql('select 1')
      break
    } catch {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  docker('volume', 'create', `${NS}-a`)
  docker('volume', 'create', `${NS}-b`)
  docker('run', '--rm', '-v', `${NS}-a:/v`, '--entrypoint', 'sh', IMAGE, '-c', 'mkdir -p /v/w1 && echo "a project file" > /v/w1/readme.txt')
  d = new DockerStreams(guarded(NS, dockerCli), guarded(NS, dockerStream), HELPER)
})

afterAll(() => {
  for (const c of [HELPER, DB]) docker.quiet('rm', '-f', '-v', c)
  for (const v of [`${NS}-a`, `${NS}-b`]) docker.quiet('volume', 'rm', '-f', v)
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function* records(parts: [string, AsyncIterable<Buffer>][]): AsyncGenerator<SealedRecord> {
  for (const [name, bytes] of parts) {
    yield { type: 'begin', name }
    for await (const b of bytes) yield { type: 'data', bytes: b }
    yield { type: 'end' }
  }
}

describe('a backup’s Docker actions', () => {
  it('seals a database and a volume, and restores them from the sealed file @SC-828', async () => {
    psql('create table notes (body text); insert into notes values (\'before the backup\')')
    const secret = crypto.randomBytes(32)
    const header = newHeader({
      id: 'c0ffee00', kind: 'now', namespace: NS, machine: 'test', siteName: 'test', holds: ['site'],
      night: '2026-10-13', takenAt: new Date().toISOString(), version: 'dev', hqAddress: null,
    })
    const file = path.join(tmp, 'backup.sealed')
    const parts: [string, AsyncIterable<Buffer>][] = [['db', d.dumpDatabase(DB, 'app')], ['files', d.readFolder({ volume: `${NS}-a` })]]
    await pipeline(Readable.from(sealBackup(header, holderFrom(secret).publicKey, records(parts))), fs.createWriteStream(file))
    expect(fs.readFileSync(file).includes(Buffer.from('before the backup'))).toBe(false)

    psql('insert into notes values (\'after the backup\')')
    const { records: rs } = await openBackup(fs.createReadStream(file) as AsyncIterable<Buffer>, holderFrom(secret))
    await eachPart(rs, async (name, bytes) => {
      if (name === 'db') await d.restoreDatabase(DB, 'app', bytes)
      if (name === 'files') await d.writeFolder({ volume: `${NS}-b` }, bytes)
    })
    expect(psql('select string_agg(body, \',\') from notes')).toBe('before the backup')
    expect(docker('run', '--rm', '-v', `${NS}-b:/v`, '--entrypoint', 'cat', IMAGE, '/v/w1/readme.txt').trim()).toBe('a project file')
  })

  it('tests, writes, lists and reads a folder the machine admin names, and says when it does not exist @SC-829', async () => {
    const dir = path.join(tmp, 'location')
    fs.mkdirSync(dir)
    expect(await d.testWrite(dir)).toBeNull()
    expect(await d.testWrite(path.join(tmp, 'not-mounted'))).toBe('missing')
    await d.write(dir, 'hq-box-20261013T020000Z-nightly-c0ffee00.sealed', (async function* () { yield Buffer.from('sealed bytes') })())
    expect(await d.list(dir)).toEqual([{ name: 'hq-box-20261013T020000Z-nightly-c0ffee00.sealed', sizeBytes: 12 }])
    const back: Buffer[] = []
    for await (const b of d.read(dir, 'hq-box-20261013T020000Z-nightly-c0ffee00.sealed')) back.push(b)
    expect(Buffer.concat(back).toString()).toBe('sealed bytes')
  })
})

describe.skipIf(!process.env.HOST_E2E)('HQ and its site, backed up and restored on a fresh machine', () => {
  const state1 = () => path.join(tmp, 'state-1')
  const state2 = () => path.join(tmp, 'state-2')
  const location = () => path.join(tmp, 'nas')
  // HQ's project last: the site and the Fleet Console join its link network, which goes with it.
  const projects = [NAMES.siteProject, NAMES.consoleProject, NAMES.hqProject]
  // The documented name, `<namespace>-host`: the service finds its own state folder, and its helper image, by it.
  const run = (state: string) => {
    recordNamespace(state, NS)
    docker('run', '-d', '--name', NAMES.hostContainer, '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', `${state}:/state`,
      '-v', `${location()}:${location()}`, '-v', `${NAMES.hostFiguresVolume}:/run/host-figures`, '--network', 'host', IMAGE)
  }
  const cli = (input: string, ...args: string[]) => docker.with({ input }, 'exec', '-i', NAMES.hostContainer, 'agenthix', ...args)

  afterAll(() => {
    docker.quiet('rm', '-f', NAMES.hostContainer)
    for (const p of projects) docker.quiet('compose', '-p', p, 'down', '-v')
    docker.quiet('volume', 'rm', NAMES.hostFiguresVolume)
  })

  it('brings back HQ’s database and the site’s workspaces from the backup location, with the key @SC-833', async () => {
    fs.mkdirSync(state1())
    fs.mkdirSync(location())
    run(state1())
    await new Promise(r => setTimeout(r, 3000))
    cli('', 'install', '--address', HQ_ADDRESS, '--console-port', String(CONSOLE_PORT), '--yes')
    const set = cli('n\ny\n', 'backup', 'location', location())
    const key = /Key: (\S+)/.exec(set)![1]
    cli('', 'backup')
    expect(fs.readdirSync(location()).filter(f => f.endsWith('.sealed'))).toHaveLength(1)

    docker('rm', '-f', NAMES.hostContainer)
    for (const p of projects) docker('compose', '-p', p, 'down', '-v')

    fs.mkdirSync(state2())
    run(state2())
    await new Promise(r => setTimeout(r, 3000))
    const restored = cli(`1\n${key}\ny\n`, 'restore', '--from', location(), '--console-port', String(CONSOLE_PORT))
    expect(restored).toMatch(/Checking the key \.+ passes/)
    expect(restored).toContain('Restored.')
    expect(cli('', 'status')).toMatch(/Running\./)

    // Every volume the restore made carries compose's labels, so taking the projects down removes them all; only the
    // figures volume, which the host service's own container mounts, is left (and the two the Docker actions above made).
    for (const p of projects) docker('compose', '-p', p, 'down', '-v')
    const left = docker('volume', 'ls', '-q').split('\n').filter(v => v.startsWith(`${NS}-`) && ![NAMES.hostFiguresVolume, `${NS}-a`, `${NS}-b`].includes(v))
    expect(left).toEqual([])
  }, 20 * 60_000)
})
