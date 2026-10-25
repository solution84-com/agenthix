import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UNSCANNED_SECRET, type RunChange } from '../../seams'
import { readPackObjects } from '../gitObjects'
import { scanChanges } from '../scan'
import { material } from './material'

const CANARY = 'canary-7f3a9c1e-deploy-key'
const OTHER = 'canary-b21d44aa-db-password'
const MAT = material({ DEPLOY_KEY: CANARY, DB_PASSWORD: OTHER })

let root: string
let snapshot: string
let out: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-scan-'))
  snapshot = path.join(root, 'snapshot')
  out = path.join(root, 'out')
  await fs.mkdir(snapshot)
  await fs.mkdir(out)
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function write(rel: string, content: string | Buffer, base = snapshot) {
  await fs.mkdir(path.dirname(path.join(base, rel)), { recursive: true })
  await fs.writeFile(path.join(base, rel), content)
}

const file = (p: string): RunChange => ({ kind: 'file', path: p, created: true })
const scan = (changes: RunChange[]) => scanChanges({ runId: 'run-1', snapshotDir: snapshot, outDir: out, changes, material: MAT })

function git(args: string[]) {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: snapshot, stdio: 'ignore' })
}

async function allFiles(dir: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) found.push(...await allFiles(path.join(dir, e.name), rel))
    else found.push(rel)
  }
  return found
}

describe('scanChanges @SC-1352', () => {
  it('finds nothing in clean changes', async () => {
    await write('src/app.ts', 'export const x = 1\n')
    expect(await scan([file('src/app.ts')])).toEqual({ leaks: [] })
  })

  it('finds a value in a changed file, in any form, and names the file and the secret', async () => {
    await write('a.env', `KEY=${CANARY}\n`)
    await write('b.txt', `${Buffer.from(`x:${OTHER}`).toString('base64')}\n`)
    await write('c.hex', Buffer.from(CANARY).toString('hex').toUpperCase())
    const { leaks } = await scan([file('a.env'), file('b.txt'), file('c.hex')])
    expect(leaks).toEqual([
      { path: 'a.env', secretName: 'DEPLOY_KEY' },
      { path: 'b.txt', secretName: 'DB_PASSWORD' },
      { path: 'c.hex', secretName: 'DEPLOY_KEY' },
    ])
  })

  it('reads every file the run changed by content, ignoring the ones it did not list', async () => {
    await write('listed.txt', 'fine')
    await write('unlisted.txt', CANARY)
    expect((await scan([file('listed.txt')])).leaks).toEqual([])
  })

  it('scans everything in /run/out, in folders too', async () => {
    await write('deep/er/token.txt', `t=${CANARY}`, out)
    expect((await scan([])).leaks).toEqual([{ path: '/run/out/deep/er/token.txt', secretName: 'DEPLOY_KEY' }])
  })

  it('reads a link as its target, never following it', async () => {
    const outside = path.join(root, 'outside.txt')
    await fs.writeFile(outside, CANARY)
    await fs.symlink(outside, path.join(snapshot, 'to-outside'))
    await fs.symlink(`/tmp/${CANARY}`, path.join(snapshot, 'named'))
    const { leaks } = await scan([{ kind: 'link', path: 'to-outside', created: true }, { kind: 'link', path: 'named', created: true }])
    expect(leaks).toEqual([{ path: 'named', secretName: 'DEPLOY_KEY' }])
  })

  it('finds a value in a path name, and masks it in the report', async () => {
    await fs.mkdir(path.join(snapshot, CANARY))
    await write(`${CANARY}/x.txt`, 'fine')
    const { leaks } = await scan([{ kind: 'dir', path: CANARY }, file(`${CANARY}/x.txt`)])
    expect(leaks).toEqual([{ path: '***', secretName: 'DEPLOY_KEY' }, { path: '***/x.txt', secretName: 'DEPLOY_KEY' }])
    expect(JSON.stringify(leaks)).not.toContain(CANARY)
  })

  it('fails closed on a file it cannot read', async () => {
    expect((await scan([file('gone.txt')])).leaks).toEqual([{ path: 'gone.txt', secretName: UNSCANNED_SECRET }])
  })

  it('finds a committed value in git\'s loose objects, and in a pack after gc', async () => {
    git(['init', '-q'])
    await write('notes.md', 'hello\n')
    git(['add', '.'])
    git(['commit', '-qm', 'first'])
    await write('config.json', `{"token":"${CANARY}"}\n`)
    git(['add', 'config.json'])
    git(['commit', '-qm', 'second'])
    await fs.rm(path.join(snapshot, 'config.json'))
    const loose = (await allFiles(snapshot)).filter(p => /^\.git\/objects\/[0-9a-f]{2}\//.test(p))
    const looseLeaks = (await scan(loose.map(file))).leaks
    expect(looseLeaks.length).toBe(1)
    expect(looseLeaks[0]!.secretName).toBe('DEPLOY_KEY')

    git(['gc', '-q', '--aggressive', '--prune=now'])
    const packs = (await allFiles(snapshot)).filter(p => p.startsWith('.git/'))
    const leaks = (await scan(packs.map(file))).leaks
    expect(leaks.some(l => /\.pack$/.test(l.path) && l.secretName === 'DEPLOY_KEY')).toBe(true)
  })

  it('finds a value stored as a delta in a pack', async () => {
    git(['init', '-q'])
    const body = Array.from({ length: 200 }, (_, i) => `line ${i} of a long file that changes little`).join('\n')
    const tail = Array.from({ length: 40 }, (_, i) => `tail ${i} padding padding padding`).join('\n')
    await write('big.txt', `${body}\n${tail}\n`)
    git(['add', '.'])
    git(['commit', '-qm', 'one'])
    // Smaller than the versions around it, so git stores it as a delta against one of them.
    await write('big.txt', `${body}\nsecret=${CANARY}\n`)
    git(['commit', '-qam', 'two'])
    const secretBlob = execFileSync('git', ['hash-object', 'big.txt'], { cwd: snapshot, encoding: 'utf8' }).trim()
    await write('big.txt', `${body}\n${tail}\nmore\n`)
    git(['commit', '-qam', 'three'])
    git(['repack', '-adq', '--depth=50', '--window=50'])
    const packs = (await allFiles(snapshot)).filter(p => /\.pack$/.test(p))
    expect(packs.length).toBe(1)
    const verify = execFileSync('git', ['verify-pack', '-v', path.join(snapshot, packs[0]!)], { encoding: 'utf8' })
    expect(verify.split('\n').find(l => l.startsWith(secretBlob))?.trim().split(/\s+/).length).toBe(7)
    expect((await scan(packs.map(file))).leaks).toEqual([{ path: packs[0], secretName: 'DEPLOY_KEY' }])
    // The delta is applied: the object comes back as committed, not as the delta's instructions.
    const objects = readPackObjects(await fs.readFile(path.join(snapshot, packs[0]!)), 0)
    expect(objects.some(o => o.equals(Buffer.from(`${body}\nsecret=${CANARY}\n`)))).toBe(true)
  })

  it('fails closed on a pack it cannot read', async () => {
    await write('broken.pack', Buffer.concat([Buffer.from('PACK'), Buffer.from([0, 0, 0, 2, 0, 0, 0, 5]), Buffer.from('junkjunk')]))
    expect((await scan([file('broken.pack')])).leaks).toEqual([{ path: 'broken.pack', secretName: UNSCANNED_SECRET }])
  })

  it('fails closed on material it cannot read', async () => {
    await write('a.txt', 'fine')
    const leaks = (await scanChanges({ runId: 'r', snapshotDir: snapshot, outDir: out, changes: [file('a.txt')], material: { key: 'a2V5', forms: [{ length: 0, hmac: 'x', secretName: 'X', class: 'raw' }] } })).leaks
    expect(leaks).toEqual([{ path: 'a.txt', secretName: UNSCANNED_SECRET }])
  })
})
