/**
 * `files.serve` for a workspace's file at a commit (site protocol 1.18): the same reader, head, ranges and version
 * check as every file, its bytes read from the workspace's repository in the code space at that commit; the folder's
 * own files beside it are never what is served. A ticket for a commit outside a workspace, a path into `.git` or a
 * link, or a version that is not the file's blob id is refused.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FILES_SERVE_METHOD, createStreamHeadReader, type FileServeHead } from '@agenthix/core'
import { getCodeDir } from '../../storage/paths'
import { openRead } from '../../hq/content/__tests__/contentReadHarness'
import { forgetGitFileCopiesForTests } from '../../files/gitFiles'
import { createFilesServe } from '../filesServe'
import { ReadSlots } from '../readSlots'
import { RELAY_ID, SITE_ID, fileTicketClaims, fixedKeys, makeKey, signToken } from './ticketKit'

vi.mock('#db', () => ({
  prisma: { workspace: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'w1' ? { id: 'w1' } : null)) } },
}))

const hqKey = makeKey('hq-1')
const loc = { ownerType: 'project' as const, ownerId: 'proj-0001', workspaceId: 'w1', taskId: null }
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])

let root: string
let code: string
let commit: string
const savedSiteRoot = process.env.SITE_ROOT
const savedIsolation = process.env.AGENT_CONTAINER_ISOLATION

const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
  cwd: code, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' },
}).toString().trim()

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  delete process.env.AGENT_CONTAINER_ISOLATION
  code = getCodeDir(loc)
  await fs.mkdir(path.join(code, 'images'), { recursive: true })
  await fs.writeFile(path.join(code, 'images', 'chart.png'), PNG)
  await fs.writeFile(path.join(code, 'README.md'), '# Sales\n')
  git(['init', '-q', '-b', 'main']); git(['add', '-A']); git(['commit', '-qm', 'v1'])
  commit = git(['rev-parse', 'HEAD'])
})

afterEach(async () => {
  await forgetGitFileCopiesForTests()
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  if (savedIsolation !== undefined) process.env.AGENT_CONTAINER_ISOLATION = savedIsolation
  await fs.rm(root, { recursive: true, force: true })
})

const blobOf = (p: string) => git(['rev-parse', `${commit}:${p}`])
const ticket = (ref: Record<string, unknown>, version: string, over: Record<string, unknown> = {}) =>
  signToken(hqKey, fileTicketClaims({ space: 'place', loc, path: 'images/chart.png', commit, ...ref } as never, version, over))

async function serve(params: unknown) {
  const handler = createFilesServe({ siteId: SITE_ID, relayId: RELAY_ID, keys: fixedKeys({ keys: [hqKey.jwk] }), slots: new ReadSlots() })
  const read = openRead(params, undefined, undefined, handler, FILES_SERVE_METHOD)
  await read.outcome
  await vi.waitFor(() => expect(read.handlerSettled()).toBe('resolved'), { timeout: 10_000 })
  const parsed = createStreamHeadReader().push(new Uint8Array(read.body()))
  if (parsed.state !== 'head') throw new Error(`no head: ${parsed.state}`)
  return { head: parsed.head, bytes: Buffer.from(parsed.rest) }
}
const refusalOf = (head: FileServeHead) => ('refusal' in head ? head.refusal : null)

describe('files.serve: a workspace file at a commit @SC-1896', () => {
  it('serves an image as the commit holds it, typed by its name, whole and by range', async () => {
    const t = ticket({}, blobOf('images/chart.png'))
    const whole = await serve({ ticket: t })
    expect(whole.head).toEqual({ status: 200, size: PNG.length, contentType: 'image/png', purpose: 'preview', fileName: 'chart.png' })
    expect(whole.bytes).toEqual(PNG)
    const ranged = await serve({ ticket: t, range: 'bytes=1-3' })
    expect(ranged.head).toMatchObject({ status: 206, range: { start: 1, end: 3 } })
    expect(ranged.bytes.toString()).toBe('PNG')
  })

  it('serves the commit\'s file, never the folder\'s changed one', async () => {
    await fs.writeFile(path.join(code, 'README.md'), '# Not committed\n')
    const { bytes } = await serve({ ticket: ticket({ path: 'README.md' }, blobOf('README.md'), { purpose: 'download' }) })
    expect(bytes.toString()).toBe('# Sales\n')
  })

  it('refuses a version that is not the file\'s blob id, as a file that changed', async () => {
    expect(refusalOf((await serve({ ticket: ticket({}, '14:1799999000000') })).head)).toBe('changed')
    expect(refusalOf((await serve({ ticket: ticket({}, blobOf('README.md')) })).head)).toBe('changed')
  })

  it('refuses a commit outside a workspace, a path into .git or stepping out, and a link', async () => {
    await fs.symlink('/etc/passwd', path.join(code, 'leak'))
    git(['add', '-A']); git(['commit', '-qm', 'link'])
    const withLink = git(['rev-parse', 'HEAD'])
    for (const ref of [
      { loc: { ownerType: 'project', ownerId: 'proj-0001', workspaceId: null, taskId: null } },
      { path: '.git/config' }, { path: '../../../../etc/passwd' }, { commit: 'main' }, { commit: 'f'.repeat(40) },
    ]) {
      expect(refusalOf((await serve({ ticket: ticket(ref, 'x') })).head), JSON.stringify(ref)).toMatch(/ticket-invalid|not-found/)
    }
    expect(refusalOf((await serve({ ticket: ticket({ path: 'leak', commit: withLink }, 'x') })).head)).toBe('not-found')
  })

  it('serves nothing for a workspace this site does not hold', async () => {
    const other = { ...loc, workspaceId: 'w2' }
    expect(refusalOf((await serve({ ticket: ticket({ loc: other }, blobOf('images/chart.png')) })).head)).toBe('not-found')
  })
})
