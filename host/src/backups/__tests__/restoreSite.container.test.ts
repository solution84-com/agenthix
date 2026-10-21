/**
 * Restoring a lost site onto a new machine (adr-0119), as far as one Docker host can check it
 * (`npm run test:container`): the built image carries the command, and on a machine where nothing runs it reads a
 * site's backup and refuses — in words, changing nothing — to restore it without a code, or with a key that does not
 * open it. The restore itself needs two machines, each with its own host
 * service, and a Fleet Console whose fleet admin confirms the new one; it is checked by hand on two machines.
 *
 * Build the image first, at the repository root: `docker build -f host/docker/Dockerfile -t agenthix-host .` (or name
 * another with HOST_IMAGE). The help line needs nothing more. Reading the backup, with HOST_E2E=1, starts the image
 * with the Docker socket — the host service reads a folder through its own container — and installs nothing. The
 * test runs under a namespace of its own for the run, recorded in the state folder, so the host service's container
 * is `<namespace>-host` and the backup is sealed for that namespace, in the form a site's nightly backup takes; every
 * docker command goes through the guard (`containerGuard.ts`), so nothing of a real install beside it is touched.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimNames, guardedDocker, recordNamespace, testNamespace } from '../../__tests__/containerGuard'
import { holderFrom, newHeader, sealBackup, type SealedRecord } from '../seal'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('restoresite')
const NAME = claimNames(NS).hostContainer
let state: string
let backups: string

const docker = guardedDocker(NS)

function cli(input: string, ...args: string[]): { code: number; text: string } {
  try {
    return { code: 0, text: docker.with({ input }, 'exec', '-i', NAME, 'agenthix', ...args) }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, text: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

async function* records(manifest: object): AsyncGenerator<SealedRecord> {
  for (const [name, body] of [['manifest', JSON.stringify(manifest)], ['site/database', 'rows'], ['site/data', 'files']] as const) {
    yield { type: 'begin', name }
    yield { type: 'data', bytes: Buffer.from(body) }
    yield { type: 'end' }
  }
}

beforeAll(async () => {
  state = fs.mkdtempSync(path.join(os.tmpdir(), 'host-restore-site-'))
  backups = fs.mkdtempSync(path.join(os.tmpdir(), 'host-restore-site-backups-'))
  recordNamespace(state, NS)
  const secret = crypto.randomBytes(15)
  const takenAt = '2026-10-14T02:00:00.000Z'
  const header = newHeader({
    id: 'c0ffee01', kind: 'nightly', namespace: NS, machine: 'office-server', siteName: 'office', holds: ['site'],
    night: '2026-10-13', takenAt, version: '0.0.1', hqAddress: null,
  })
  const manifest = {
    hq: null,
    site: { name: 'office', version: '0.0.1', images: {}, hqUrl: 'https://hq.acme.example', installedAt: takenAt },
    secrets: { hqMasterKey: 'x', siteMasterKey: 'y' },
    siteCredential: 'c'.repeat(64),
  }
  await pipeline(Readable.from(sealBackup(header, holderFrom(secret).publicKey, records(manifest))),
    fs.createWriteStream(path.join(backups, 'office-server-20261014T020000Z-nightly-c0ffee01.sealed')))
  // The folder at the same path inside and out, as a machine admin's mounted folder is.
  const socket = process.env.HOST_E2E ? ['-v', '/var/run/docker.sock:/var/run/docker.sock'] : []
  docker('run', '-d', '--name', NAME, ...socket, '-v', `${state}:/state`, '-v', `${backups}:${backups}:ro`, IMAGE)
  for (let i = 0; i < 50; i++) {
    try {
      docker('exec', NAME, 'test', '-S', '/run/host/owner.sock')
      break
    } catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
})

afterAll(() => {
  docker.quiet('exec', NAME, 'sh', '-c', 'rm -rf /state/* /state/.[!.]*')
  docker.quiet('rm', '-f', NAME)
  fs.rmSync(state, { recursive: true, force: true })
  fs.rmSync(backups, { recursive: true, force: true })
})

describe('restoring a lost site onto a new machine, in the built image @SC-834', () => {
  it('lists the command with HQ\'s address and the code', () => {
    expect(cli('', 'help', 'restore').text.replace(/\s+/g, ' ')).toContain('restore --from <folder or file> [<hq address> <code>]')
  })

})

describe.skipIf(!process.env.HOST_E2E)("a site's backup, read on a machine where nothing runs", () => {
  it('reads it, then says a code is needed before it asks for the key, and changes nothing', () => {
    const r = cli('1\n', 'restore', '--from', backups)
    expect(r.code).toBe(1)
    expect(r.text.replace(/\s+/g, ' ')).toContain('This is a backup of the site office. It comes back as the same site once a fleet admin lets this machine take its place')
    expect(fs.existsSync(path.join(state, 'site'))).toBe(false)
  })

  it('refuses a wrong key in words before it joins anything', () => {
    const r = cli('1\nAAAA-AAAA-AAAA-AAAA-AAAA-AAAA\n', 'restore', '--from', backups, 'https://hq.acme.example', '7KQ4-M2XD-46Q3')
    expect(r.code).toBe(1)
    expect(r.text).toMatch(/That key does not open this backup|That is not a key/)
    expect(fs.existsSync(path.join(state, 'link', 'console.json'))).toBe(false)
  })
})
