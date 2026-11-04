/**
 * The commit helper in its real container: the program runs in the agent image with no network, a read-only root,
 * no capability and only the folders the operation names; a read-only workspace cannot be written from inside it;
 * and a hook planted in a copy does not run.
 *
 * Run with `npm run test:container` from site/. Needs Docker and the agent image (AGENT_TEST_IMAGE,
 * `imgtest/agent:dev` by default); skipped when either is missing. One short-lived container at a time, named
 * `<HELPER_TEST_NAMESPACE>-commit-helper-…`, removed when its operation ends. Calls no model.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildHelperArgs, helperDeps, runHelper } from '../helperContainer'
import { AGENT, AUTHOR, COPY_A, at, makeOwner, sh, write, type Owner } from './gitFixture'

const IMAGE = process.env.AGENT_TEST_IMAGE ?? 'imgtest/agent:dev'
const available = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
const contained = { ...helperDeps, contained: () => true, protectionsProblem: async () => null }

let owner: Owner
const saved = { image: process.env.AGENT_IMAGE, ns: process.env.HOST_NAMESPACE }
beforeAll(() => {
  process.env.AGENT_IMAGE = IMAGE
  process.env.HOST_NAMESPACE = process.env.HELPER_TEST_NAMESPACE ?? 'lp-lane-p1-site'
})
afterAll(() => {
  process.env.AGENT_IMAGE = saved.image
  process.env.HOST_NAMESPACE = saved.ns
})
beforeEach(() => {
  owner = makeOwner()
  // The helper runs as uid 1001, as the site's storage is owned in the image.
  fs.chmodSync(owner.root, 0o777)
  for (const d of [path.dirname(owner.ws), owner.ws, path.join(owner.root, 'clones')]) fs.chmodSync(d, 0o777)
})

const op = (q: Record<string, unknown>, ws: boolean, copy?: boolean) => {
  if (copy !== undefined) fs.mkdirSync(owner.copyDir(COPY_A), { recursive: true, mode: 0o777 })
  return runHelper({
    workspaceId: 'w1', ws: { dir: owner.ws, readOnly: !ws },
    ...(copy !== undefined ? { copy: { dir: owner.copyDir(COPY_A), readOnly: !copy } } : {}),
    network: false, timeoutMs: 60_000,
  }, q, contained)
}

describe.skipIf(!available)('the commit helper in its container @SC-1720', () => {
  it('starts with no network, no capability, a read-only root and only the folders named', () => {
    const args = buildHelperArgs({ workspaceId: 'w1', ws: { dir: '/s/w', readOnly: true }, network: false, timeoutMs: 1 }, 'n', 'none')
    for (const flag of [['--network', 'none'], ['--cap-drop', 'ALL'], ['--security-opt', 'no-new-privileges']]) {
      expect(args[args.indexOf(flag[0]) + 1]).toBe(flag[1])
    }
    expect(args).toContain('--read-only')
    expect(args.filter(a => a.startsWith('type=bind'))).toEqual(['type=bind,source=/s/w,target=/o/main,readonly'])
    expect(args.join(' ')).not.toContain('docker.sock')
  })

  it('turns Git on, makes a branch and its copy, commits, brings it back and merges', async () => {
    write(owner.ws, 'README.md', 'hello\n')
    const init = await op({ op: 'init', author: AUTHOR, at: at(), message: 'First version', large: 1 << 20, ignored: ['node_modules'] }, true)
    expect(init).toMatchObject({ main: 'main', version: { number: 1 } })
    expect(await op({ op: 'create', branch: 'login-page', originUrl: '/projects/p/workspaces/w1' }, true, true)).toHaveProperty('head')
    write(owner.copyDir(COPY_A), 'login.html', '<form></form>\n')
    fs.chmodSync(owner.copyDir(COPY_A), 0o777)
    const c = await op({ op: 'commit', branch: 'login-page', message: 'Add login', author: AGENT, at: at() }, false, true)
    expect(c).toHaveProperty('commit')
    expect(await op({ op: 'bringBack', branch: 'login-page', date: '2026-11-01' }, true, false)).toMatchObject({ moved: true })
    const main = (init.version as { commit: string }).commit
    expect(await op({ op: 'merge', branch: 'login-page', base: null, expectedMain: main, message: 'Login', author: AUTHOR, at: at() }, true))
      .toMatchObject({ version: { number: 2 } })
  })

  it('cannot write a workspace mounted read-only, and runs no hook planted in a copy', async () => {
    write(owner.ws, 'README.md', 'hello\n')
    await op({ op: 'init', author: AUTHOR, at: at(), message: 'First version', large: 1 << 20, ignored: [] }, true)
    await op({ op: 'create', branch: 'login-page', originUrl: '/p' }, true, true)
    const before = sh(owner.ws, ['rev-parse', 'main'])
    const hooks = path.join(owner.copyDir(COPY_A), '.git', 'hooks')
    fs.mkdirSync(hooks, { recursive: true })
    fs.writeFileSync(path.join(hooks, 'post-commit'), '#!/bin/sh\ntouch "$(git rev-parse --show-toplevel)/ran"\n', { mode: 0o755 })
    fs.appendFileSync(path.join(owner.copyDir(COPY_A), '.git', 'config'), '[core]\n\thooksPath = .git/hooks\n')
    write(owner.copyDir(COPY_A), 'a.txt', 'a\n')
    expect(await op({ op: 'commit', branch: 'login-page', message: 'a', author: AGENT, at: at() }, false, true)).toHaveProperty('commit')
    expect(fs.existsSync(path.join(owner.copyDir(COPY_A), 'ran'))).toBe(false)
    expect(await op({ op: 'bringBack', branch: 'login-page', date: '2026-11-01' }, true, false)).toMatchObject({ moved: true })
    expect(await op({ op: 'merge', branch: 'login-page', base: null, expectedMain: before, message: 'x', author: AUTHOR, at: at() }, false))
      .toHaveProperty('refused')
    expect(sh(owner.ws, ['rev-parse', 'main'])).toBe(before)
  })

  it("is given a boundary's whole folder for a branch's copy, and a symbolic link there reaches nothing outside it (adr-0173)", async () => {
    const siteRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'helper-boundary-')))
    const savedRoot = process.env.SITE_ROOT
    process.env.SITE_ROOT = siteRoot
    try {
      const boundary = path.join(siteRoot, 'projects', 'p1')
      const other = path.join(siteRoot, 'projects', 'p2', 'clones', COPY_A)
      fs.mkdirSync(path.join(other, '.git'), { recursive: true })
      fs.mkdirSync(path.join(boundary, 'clones'), { recursive: true, mode: 0o777 })
      // Relative, as a run would make it: on this machine it leads to another project's copy.
      fs.symlinkSync(path.join('..', '..', 'p2', 'clones', COPY_A), path.join(boundary, 'clones', COPY_A))
      const spec = { workspaceId: 'w1', copy: { dir: path.join(boundary, 'clones', COPY_A), readOnly: true }, network: false, timeoutMs: 60_000 }
      expect(buildHelperArgs(spec, 'n', 'none').filter(a => a.startsWith('type=bind'))).toEqual([`type=bind,source=${boundary},target=/o/b,readonly`])
      const answer = await runHelper(spec, { op: 'copyHead', branch: 'main' }, contained)
      expect(answer.refused).toBeDefined()
      expect(fs.readdirSync(other)).toEqual(['.git'])
    } finally {
      process.env.SITE_ROOT = savedRoot
      fs.rmSync(siteRoot, { recursive: true, force: true })
    }
  })
})
