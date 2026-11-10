/**
 * One file of a workspace with Git at one commit, as the file viewer reads it (site protocol 1.18): its facts with its
 * first bytes, and its bytes whole into a folder of the site's own. Only a plain file of that commit's tree: a path
 * stepping out, into `.git`, a link, a submodule, a folder or a revision that is not one commit reads as nothing.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runHelper } from '../helperContainer'
import { gitOn, local, makeOwner, sh, write, type Owner } from './gitFixture'

let owner: Owner
let out: string
let outside: string
beforeEach(() => {
  owner = makeOwner()
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-out-'))
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-outside-'))
})
afterEach(() => {
  for (const dir of [owner.root, out, outside]) fs.rmSync(dir, { recursive: true, force: true })
})

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff, 0x00])

function read(request: Record<string, unknown>, into: string | null = out) {
  return runHelper({
    workspaceId: 'w1', ws: { dir: owner.ws, readOnly: true }, ...(into ? { out: { dir: into } } : {}), network: false, timeoutMs: 60_000,
  }, request, local)
}
const facts = (commit: string, p: string) => read({ op: 'fileFacts', commit, path: p, sniff: 8 }, null)
const bytes = (commit: string, p: string) => read({ op: 'fileOut', commit, path: p })

async function repo(): Promise<string> {
  await gitOn(owner, { 'README.md': '# Sales\n', 'code/invoice.ts': 'export {}\n' })
  fs.writeFileSync(path.join(owner.ws, 'images.png'), PNG)
  fs.mkdirSync(path.join(owner.ws, 'images'))
  fs.writeFileSync(path.join(owner.ws, 'images', 'chart.png'), PNG)
  sh(owner.ws, ['add', '-A']); sh(owner.ws, ['commit', '-qm', 'pictures'])
  return sh(owner.ws, ['rev-parse', 'HEAD'])
}

describe('a file of a workspace with Git, at one commit @SC-1686', () => {
  it('answers a binary file\'s blob id, size, commit time and first bytes, and writes its bytes whole', async () => {
    const commit = await repo()
    const oid = sh(owner.ws, ['rev-parse', `${commit}:images/chart.png`])
    const f = await facts(commit, 'images/chart.png')
    expect(f).toMatchObject({ exists: true, oid, size: PNG.length })
    expect(Buffer.from(String(f.head), 'base64')).toEqual(PNG.subarray(0, 8))
    expect(Date.parse(String(f.at))).not.toBeNaN()
    expect(await bytes(commit, 'images/chart.png')).toMatchObject({ exists: true, oid, size: PNG.length })
    expect(fs.readFileSync(path.join(out, 'blob'))).toEqual(PNG)
  })

  it('reads the file as that commit holds it, not as the folder holds it now', async () => {
    const first = await repo()
    write(owner.ws, 'README.md', '# Changed, not committed\n')
    await bytes(first, 'README.md')
    expect(fs.readFileSync(path.join(out, 'blob'), 'utf8')).toBe('# Sales\n')
  })

  it('reads nothing for a path that steps out of the repository or into its .git', async () => {
    const commit = await repo()
    write(outside, 'secret', 'do not read')
    for (const p of ['../../../etc/passwd', '/etc/passwd', '.git/config', 'a/.GIT/HEAD', 'code/../README.md', '', 'a\\b', 'x\nREADME.md']) {
      expect(await facts(commit, p), JSON.stringify(p)).toMatchObject({ refused: 'invalid' })
      expect(await bytes(commit, p), JSON.stringify(p)).toMatchObject({ refused: 'invalid' })
    }
    expect(fs.readdirSync(out)).toEqual([])
  })

  it('reads nothing for a pathspec pattern: a path is only ever itself', async () => {
    const commit = await repo()
    for (const p of ['*.md', 'code/*', ':(glob)**/README.md', 'READ?E.md']) {
      expect(await facts(commit, p), p).toEqual({ exists: false })
    }
  })

  it('never follows a link in the tree, wherever it points', async () => {
    await repo()
    write(outside, 'secret', 'do not read')
    fs.symlinkSync(path.join(outside, 'secret'), path.join(owner.ws, 'leak'))
    fs.symlinkSync('README.md', path.join(owner.ws, 'inside'))
    sh(owner.ws, ['add', '-A']); sh(owner.ws, ['commit', '-qm', 'links'])
    const commit = sh(owner.ws, ['rev-parse', 'HEAD'])
    for (const p of ['leak', 'inside']) {
      expect(await facts(commit, p), p).toEqual({ exists: false })
      expect(await bytes(commit, p), p).toEqual({ exists: false })
    }
    expect(fs.readdirSync(out)).toEqual([])
  })

  it('reads nothing for a folder or a submodule', async () => {
    const commit = await repo()
    expect(await facts(commit, 'images')).toEqual({ exists: false })
    sh(owner.ws, ['update-index', '--add', '--cacheinfo', `160000,${commit},vendor/lib`])
    sh(owner.ws, ['commit', '-qm', 'submodule'])
    const withSub = sh(owner.ws, ['rev-parse', 'HEAD'])
    expect(await facts(withSub, 'vendor/lib')).toEqual({ exists: false })
  })

  it('refuses a revision that is not one commit of this repository', async () => {
    const commit = await repo()
    const blob = sh(owner.ws, ['rev-parse', `${commit}:README.md`])
    const tree = sh(owner.ws, ['rev-parse', `${commit}^{tree}`])
    for (const rev of ['main', 'HEAD', `${commit}~1`, commit.slice(0, 12), '--output=/tmp/x', 7]) {
      expect(await facts(rev as string, 'README.md'), String(rev)).toMatchObject({ refused: 'invalid' })
    }
    for (const rev of [blob, tree, 'f'.repeat(40)]) {
      expect(await facts(rev, 'README.md'), rev).toMatchObject({ refused: 'not_found' })
    }
  })

  it('writes nothing for a file larger than it is asked to copy', async () => {
    const commit = await repo()
    expect(await read({ op: 'fileOut', commit, path: 'images/chart.png', max: PNG.length - 1 })).toMatchObject({ refused: 'tooLarge' })
    expect(fs.readdirSync(out)).toEqual([])
  })

  it('writes only into its own folder: a link planted there is not written through', async () => {
    const commit = await repo()
    write(outside, 'target', 'untouched')
    fs.symlinkSync(path.join(outside, 'target'), path.join(out, 'blob.part'))
    expect(await bytes(commit, 'README.md')).toHaveProperty('refused')
    expect(fs.readFileSync(path.join(outside, 'target'), 'utf8')).toBe('untouched')
  })
})
