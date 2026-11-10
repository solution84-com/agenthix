/**
 * A workspace's file at a commit, as `file.about` and `files.serve` read it (site protocol 1.18): its facts and bytes
 * from the workspace's repository through the commit helper, never from the folder; a copy kept in the site's own data
 * for a ticket's life; nothing for a workspace this site does not hold with Git, a path stepping out, a link or a
 * revision that is not a commit. No answer names a path on this disk.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runHelper } from '../../branches/helperContainer'
import { gitOn, local, makeOwner, sh, type Owner } from '../../branches/__tests__/gitFixture'
import {
  GIT_FILE_KEEP_MS, aboutGitFile, forgetGitFileCopiesForTests, openGitFile, type GitFileDeps, type GitPlaceFile,
} from '../gitFiles'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xff, 0x00])
const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1', taskId: null }

let owner: Owner
let root: string
let outside: string
let held: boolean
let clock: number
let runs: string[]
let deps: GitFileDeps
let commit: string

beforeEach(async () => {
  owner = makeOwner()
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-file-reads-'))
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'git-file-outside-'))
  held = true
  clock = 1_000_000
  runs = []
  deps = {
    codeDir: async ref => (held && ref.workspaceId === 'w1' ? owner.ws : null),
    helper: (spec, request) => { runs.push(String(request.op)); return runHelper(spec, request, local) },
    root: () => path.join(root, 'reads'),
    now: () => clock,
  }
  await gitOn(owner, { 'README.md': '# Sales\n' })
  fs.mkdirSync(path.join(owner.ws, 'images'))
  fs.writeFileSync(path.join(owner.ws, 'images', 'chart.png'), PNG)
  fs.writeFileSync(path.join(outside, 'secret'), 'do not read')
  fs.symlinkSync(path.join(outside, 'secret'), path.join(owner.ws, 'leak'))
  sh(owner.ws, ['add', '-A']); sh(owner.ws, ['commit', '-qm', 'pictures'])
  commit = sh(owner.ws, ['rev-parse', 'HEAD'])
})
afterEach(async () => {
  await forgetGitFileCopiesForTests()
  for (const dir of [owner.root, root, outside]) fs.rmSync(dir, { recursive: true, force: true })
})

const at = (p: string, c = commit): GitPlaceFile => ({ space: 'place', loc, path: p, commit: c })

async function bytesOf(ref: GitPlaceFile): Promise<Buffer | string> {
  const opened = await openGitFile(ref, 'files.serve', deps)
  if (!opened.ok) return opened.refusal
  try { return await opened.handle.readFile() } finally { await opened.handle.close() }
}

describe('a workspace file at a commit, read through the commit helper @SC-1896', () => {
  it('describes a binary file by its blob id, with its kind\'s first bytes', async () => {
    const answer = await aboutGitFile(at('images/chart.png'), 'file.about', deps)
    expect(answer).toMatchObject({
      ok: true, name: 'chart.png', size: PNG.length, contentType: 'image/png', looksLikeText: false,
      version: sh(owner.ws, ['rev-parse', `${commit}:images/chart.png`]),
    })
    expect(await aboutGitFile(at('README.md'), 'file.about', deps)).toMatchObject({ ok: true, looksLikeText: true })
    expect(JSON.stringify(answer)).not.toContain(owner.root)
  })

  it('serves its bytes whole, at the version the about answered', async () => {
    const opened = await openGitFile(at('images/chart.png'), 'files.serve', deps)
    expect(opened).toMatchObject({ ok: true, version: sh(owner.ws, ['rev-parse', `${commit}:images/chart.png`]) })
    if (opened.ok) {
      expect(await opened.handle.readFile()).toEqual(PNG)
      await opened.handle.close()
    }
  })

  it('keeps the copy for a ticket\'s life, then lets it go', async () => {
    await bytesOf(at('images/chart.png'))
    await bytesOf(at('images/chart.png'))
    expect(runs).toEqual(['fileOut'])
    clock += GIT_FILE_KEEP_MS + 1
    expect(await bytesOf(at('images/chart.png'))).toEqual(PNG)
    expect(runs).toEqual(['fileOut', 'fileOut'])
  })

  it('serves nothing, kept or not, once the site no longer holds the workspace with Git', async () => {
    await bytesOf(at('README.md'))
    held = false
    expect(await bytesOf(at('README.md'))).toBe('not-found')
    expect(await aboutGitFile(at('README.md'), 'file.about', deps)).toEqual({ ok: false, refusal: 'not-found' })
  })

  it('reads nothing for a path that steps out, into .git, or through a link', async () => {
    for (const p of ['../../../etc/passwd', '.git/config', 'images/../README.md', 'leak']) {
      expect(await bytesOf(at(p)), p).toBe('not-found')
      expect(await aboutGitFile(at(p), 'file.about', deps), p).toEqual({ ok: false, refusal: 'not-found' })
    }
    expect(fs.readdirSync(path.join(root, 'reads'))).toEqual([])
  })

  it('reads nothing for a revision that is not one commit', async () => {
    const blob = sh(owner.ws, ['rev-parse', `${commit}:README.md`])
    for (const c of ['main', `${commit}~1`, blob, 'f'.repeat(40)]) {
      expect(await bytesOf(at('README.md', c)), c).toBe('not-found')
    }
  })

  it('reads the commit\'s file, not the folder\'s', async () => {
    fs.writeFileSync(path.join(owner.ws, 'README.md'), '# Not committed\n')
    expect(String(await bytesOf(at('README.md')))).toBe('# Sales\n')
  })
})
