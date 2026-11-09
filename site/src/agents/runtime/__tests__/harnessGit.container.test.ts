/**
 * The git a harness runs, in an agent container.
 *
 * Both harnesses run `git` themselves, as the harness user and outside any
 * command's sandbox, in a project folder an agent can write: Claude Code for
 * the repository status it adds to its context, OpenCode for the project's
 * identity, branch, status and diffs. An agent can write the project's
 * `.git/config` and hooks, so a repository here carries, written from inside
 * an agent command's sandbox: hooks (through `core.hooksPath` as well as in
 * `.git/hooks`), a `core.fsmonitor` command, and a clean filter. Each planted
 * program leaves a mark in the project and tries to leave one in the harness
 * home, which only a program running with the harness's permissions can.
 *
 * Each harness is first run with the real git ahead on its PATH, to show that
 * what it does runs the planted programs with its own permissions; then as the
 * image runs it, where no hook or fsmonitor runs and the filter runs contained.
 *
 * Run with `npm run test:container` from site/ (vitest.container.config.ts).
 * Needs Docker and the agent image (AGENT_IMAGE, `agenthix-agent:latest`
 * by default), and is skipped when either is missing. One container
 * (AGENT_GIT_TEST_CONTAINER), capped at 1 GB and 1 CPU with no network,
 * removed at the end. Calls no model: Claude Code's model address leads
 * nowhere, and OpenCode is asked only for the project's status and diff.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { COMMAND_LAUNCHER_PATH, CONTAINED_GIT_PATH, SYSTEM_GIT_PATH } from '../agentImage'
import { OPENCODE_SERVE_ARGV, OPENCODE_SERVER_PORT, renderServerEnv } from '../opencode/openCodeConfig'

const IMAGE = process.env.AGENT_IMAGE ?? 'agenthix-agent:latest'
const NAME = process.env.AGENT_GIT_TEST_CONTAINER ?? 'agenthix-harness-git-test'
const available = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

const PROJECT = '/projects/p1'
const REPO = `${PROJECT}/files`
/** The real git found first, as a harness would find it without the image's own. */
const REAL_GIT_FIRST = 'PATH=/usr/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/sbin:/bin'

type Run = { status: number | null; stdout: string; stderr: string }

/** As the harness user with the harness's home, outside any sandbox, as both harnesses run. */
function asHarness(script: string, env: string[] = [], timeoutMs = 60_000): Run {
  const envArgs = env.flatMap(e => ['-e', e])
  return spawnSync('docker', ['exec', '-u', 'appuser', '-w', REPO, ...envArgs, NAME, 'sh', '-c', script], { encoding: 'utf8', timeout: timeoutMs })
}

/** As an agent's command: inside the launcher's sandbox. */
function asAgent(script: string): Run {
  return spawnSync('docker', ['exec', '-u', 'appuser', '-w', REPO, NAME, COMMAND_LAUNCHER_PATH, '/bin/sh', '-c', script], { encoding: 'utf8', timeout: 60_000 })
}

const HOOKS = ['pre-commit', 'post-commit', 'post-index-change']

/** Writes a planted program: it marks the project, then tries to mark the harness home. */
const planted = (file: string, mark: string, tail = 'exit 0') => [
  `cat > ${file} <<'EOF'`,
  '#!/bin/sh',
  `echo ran > ${PROJECT}/marks/${mark}`,
  `echo ran > /home/appuser/escaped-${mark} 2>/dev/null`,
  tail,
  'EOF',
  `chmod +x ${file}`,
].join('\n')

let root: string
const marks = () => fs.readdirSync(path.join(root, 'project', 'marks')).sort()
const escaped = () => fs.readdirSync(path.join(root, 'home')).filter(f => f.startsWith('escaped-')).sort()

function clearMarks(): void {
  for (const f of marks()) fs.rmSync(path.join(root, 'project', 'marks', f), { force: true })
  for (const f of escaped()) fs.rmSync(path.join(root, 'home', f), { force: true })
}

function ok(run: Run): string {
  if (run.status !== 0) throw new Error(`exit ${run.status}: ${run.stderr}`)
  return run.stdout
}

async function until(what: string, check: () => boolean, ms = 60_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise(r => setTimeout(r, 250))
  }
}

/** What Claude Code does on its first turn in a project: it gathers the repository's status before asking the model. */
function claudeTurn(extraEnv: string[]): void {
  const env = [
    'ANTHROPIC_API_KEY=sk-none', 'ANTHROPIC_BASE_URL=http://127.0.0.1:9', 'CLAUDE_CODE_MAX_RETRIES=0',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1', 'DISABLE_AUTOUPDATER=1', ...extraEnv,
  ]
  asHarness('timeout 60 claude -p hello >/dev/null 2>&1; true', env, 90_000)
}

/** OpenCode's server, as the site starts it, asked for the project's status and diff. */
async function openCodeStatus(extraEnv: string[]): Promise<void> {
  const password = randomBytes(16).toString('hex')
  const serverEnv = renderServerEnv({ password, serverKey: randomBytes(16).toString('hex'), siteUrl: 'http://127.0.0.1:1', configured: {} })
  const envArgs = [...Object.entries(serverEnv).map(([k, v]) => `${k}=${v}`), ...extraEnv].flatMap(e => ['-e', e])
  ok(spawnSync('docker', ['exec', '-d', '-u', 'appuser', '-w', '/tmp', ...envArgs, NAME, ...OPENCODE_SERVE_ARGV], { encoding: 'utf8', timeout: 30_000 }))
  const api = (p: string) => `curl -fsS --max-time 30 -u opencode:${password} 'http://127.0.0.1:${OPENCODE_SERVER_PORT}${p}'`
  try {
    await until('the OpenCode server', () => asHarness(api('/global/health')).status === 0)
    const directory = encodeURIComponent(REPO)
    // The project OpenCode resolved for the folder is a git one: found by git, run as the server.
    expect(JSON.parse(ok(asHarness(api(`/project/current?directory=${directory}`))))).toMatchObject({ vcs: 'git', worktree: REPO })
    const status = ok(asHarness(api(`/vcs/status?directory=${directory}`)))
    expect(status).toContain('notes.txt')
    ok(asHarness(api(`/vcs/diff?mode=git&directory=${directory}`)))
  } finally {
    asHarness("pkill -f '[o]pencode serve'; true")
    await until('the OpenCode server to stop', () => asHarness("pgrep -f '[o]pencode serve'").status !== 0, 30_000)
  }
}

describe.skipIf(!available)('git run by a harness, in a project an agent wrote settings into', () => {
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-git-'))
    for (const d of ['home', 'project', path.join('project', 'marks'), path.join('project', 'plant')]) {
      fs.mkdirSync(path.join(root, d), { recursive: true })
      fs.chmodSync(path.join(root, d), 0o777)
    }
    fs.writeFileSync(path.join(root, 'home', '.claude.json'), '{}')

    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    ok(spawnSync('docker', ['run', '-d', '--init', '--name', NAME, '--memory', '1g', '--cpus', '1', '--pids-limit', '1024', '--network', 'none',
      '-v', `${path.join(root, 'home')}:/home/appuser`, '-v', `${path.join(root, 'project')}:${PROJECT}`,
      // The repository's folder belongs to the harness user, as the site's storage does, and is
      // not shared with the host: Docker Desktop's file sharing can report a shared folder as
      // root's some seconds after it was made, and git refuses every command in a repository
      // whose folder another user owns, so OpenCode would never reach anything planted.
      '--tmpfs', `${REPO}:rw,exec,uid=1001,gid=1001,mode=0755`,
      IMAGE, 'tail', '-f', '/dev/null'], { encoding: 'utf8', timeout: 60_000 }))

    // A repository with one committed file, made before anything is planted.
    ok(asHarness([
      `${SYSTEM_GIT_PATH} init -q`,
      'echo one > notes.txt',
      `${SYSTEM_GIT_PATH} add notes.txt`,
      `${SYSTEM_GIT_PATH} -c user.name=t -c user.email=t@t commit -qm init`,
    ].join(' && ')))

    // The agent's part, written from its own sandbox: hooks, a hooks path, an
    // fsmonitor command and a clean filter, and a change for status to look at.
    ok(asAgent([
      ...HOOKS.map(h => planted(`${REPO}/.git/hooks/${h}`, `hook-${h}`)),
      planted(`${PROJECT}/plant/fsmonitor`, 'fsmonitor'),
      planted(`${PROJECT}/plant/clean`, 'filter', 'exec cat'),
      "echo '*.txt filter=planted' > .gitattributes",
      `${SYSTEM_GIT_PATH} config core.hooksPath ${REPO}/.git/hooks`,
      `${SYSTEM_GIT_PATH} config core.fsmonitor ${PROJECT}/plant/fsmonitor`,
      `${SYSTEM_GIT_PATH} config filter.planted.clean ${PROJECT}/plant/clean`,
      // The same size as what was committed, so git must read it, through the filter, to tell.
      'echo two > notes.txt',
    ].join('\n')))
  }, 120_000)

  afterAll(() => {
    // Files the container made may not be the host user's to remove.
    spawnSync('docker', ['exec', NAME, 'sh', '-c', `rm -rf ${PROJECT}/* /home/appuser/* /home/appuser/.[!.]*`], { stdio: 'ignore', timeout: 60_000 })
    spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' })
    if (root) fs.rmSync(root, { recursive: true, force: true })
  }, 120_000)

  beforeEach(() => clearMarks())

  it('gives every harness the image\'s git, ahead of the real one', () => {
    expect(ok(asHarness('command -v git')).trim()).toBe(CONTAINED_GIT_PATH)
  })

  it('runs the planted hooks, fsmonitor and filter with the harness\'s own permissions under the real git, outside a sandbox', () => {
    const real = SYSTEM_GIT_PATH
    ok(asHarness(`${real} status --porcelain >/dev/null && ${real} diff >/dev/null && ${real} -c user.name=h -c user.email=h@h commit --allow-empty -qm control`))
    expect(marks()).toEqual(expect.arrayContaining(['filter', 'fsmonitor', 'hook-pre-commit', 'hook-post-commit']))
    expect(escaped()).toEqual(expect.arrayContaining(['escaped-filter', 'escaped-fsmonitor', 'escaped-hook-pre-commit']))
  })

  it('runs no hook and no fsmonitor for git started by a harness, and the filter only in a sandbox', () => {
    ok(asHarness('git status --porcelain >/dev/null && git diff >/dev/null && git -c user.name=h -c user.email=h@h commit --allow-empty -qm harness'))
    expect(marks()).toEqual(['filter'])
    expect(escaped()).toEqual([])
  })

  it('keeps the repository\'s hooks for an agent\'s own git, which run in its sandbox', () => {
    ok(asAgent('git -c user.name=a -c user.email=a@a commit --allow-empty -qm agent'))
    expect(marks()).toEqual(expect.arrayContaining(['hook-pre-commit', 'hook-post-commit']))
    expect(escaped()).toEqual([])
  })

  it('Claude Code: gathering the repository\'s status runs the planted fsmonitor and filter as the harness under the real git, and neither escapes under the image\'s', () => {
    claudeTurn([REAL_GIT_FIRST])
    expect(escaped()).toEqual(expect.arrayContaining(['escaped-fsmonitor', 'escaped-filter']))

    clearMarks()
    claudeTurn([])
    expect(marks().filter(m => m !== 'filter')).toEqual([])
    expect(escaped()).toEqual([])
  }, 240_000)

  it('OpenCode: the project\'s status and diff run the planted filter as the server under the real git, and nothing planted escapes under the image\'s', async () => {
    await openCodeStatus([REAL_GIT_FIRST])
    expect(escaped()).toContain('escaped-filter')

    clearMarks()
    await openCodeStatus([])
    // The server's git did read the project through the planted filter, only contained.
    expect(marks()).toEqual(['filter'])
    expect(escaped()).toEqual([])
  }, 240_000)
})
