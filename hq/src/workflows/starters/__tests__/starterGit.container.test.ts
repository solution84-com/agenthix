/**
 * Security A13, git (workflows spec part 6; part 4, *Git with a token never runs in the agent's repository*): the
 * shipped `push` and `pull` run in the real executor image against a stand-in for github.com (`fakeGitHub.cjs`, a
 * bare repository over HTTPS that answers only the run's token). The workspace's repository is the agent's, so it
 * carries a planted `pre-push` hook, a `core.hooksPath` full of hooks, `core.fsmonitor`, `core.sshCommand` and an
 * `include.path`, each of which would record that it ran and copy the token if it could. The test shows none of them
 * runs in the step that holds the token, the token (a canary) appears in no output, file or workspace, and the push
 * and the fetch still arrive.
 *
 * Each step's container is shaped as the site starts one (`site/src/executor/stepContainer.ts`): uid 1001, read-only
 * root, no capabilities, the workspace read-only in a step with a secret, `/run/out` shared, values as files. The
 * stand-in runs inside the step's own container, on 127.0.0.1, so no second container runs beside it.
 *
 * Needs Docker and the executor image: `STARTER_CONTAINER_TESTS=1 EXECUTOR_IMAGE=imgtest/executor:dev npx vitest run
 * src/workflows/starters/__tests__/starterGit.container.test.ts`. Skipped otherwise.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { starterSource, type StarterSource } from '../definitions'

const ON = process.env.STARTER_CONTAINER_TESTS === '1'
const IMAGE = process.env.EXECUTOR_IMAGE ?? 'imgtest/executor:dev'
const NAME = `wf-lane-4d-starter-${process.pid}`
const WORK = '/workspace'
const CANARY = `ghs_canary_${randomBytes(12).toString('hex')}`

let dir: string

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd, encoding: 'utf8' }).trim()

/** What the planted programs run: record that they ran, and copy the token if this container holds one. */
const EVIL = `#!/bin/sh
echo "ran $0 $*" >> /run/out/evil.log 2>/dev/null
cat /run/secrets/GITHUB_TOKEN >> /run/out/evil.log 2>/dev/null
cat /run/secrets/GITHUB_TOKEN > /tmp/stolen 2>/dev/null
exit 0
`

function plantWorkspace(ws: string) {
  mkdirSync(ws, { recursive: true })
  git(ws, 'init', '-q', '-b', 'main')
  writeFileSync(join(ws, 'README.md'), 'hello\n')
  git(ws, 'add', '-A')
  git(ws, 'commit', '-q', '-m', 'one')
  git(ws, 'checkout', '-q', '-b', 'feature/x')
  writeFileSync(join(ws, 'feature.txt'), 'work\n')
  git(ws, 'add', '-A')
  git(ws, 'commit', '-q', '-m', 'two')
  const g = join(ws, '.git')
  writeFileSync(join(g, 'evil.sh'), EVIL)
  chmodSync(join(g, 'evil.sh'), 0o755)
  mkdirSync(join(g, 'evil-hooks'))
  for (const hook of ['pre-push', 'reference-transaction', 'post-checkout', 'pre-auto-gc', 'post-merge', 'fsmonitor-watchman']) {
    writeFileSync(join(g, 'evil-hooks', hook), EVIL)
    chmodSync(join(g, 'evil-hooks', hook), 0o755)
    writeFileSync(join(g, 'hooks', hook), EVIL)
    chmodSync(join(g, 'hooks', hook), 0o755)
  }
  writeFileSync(join(g, 'evil.cfg'), `[core]\n\tsshCommand = ${WORK}/.git/evil.sh\n[credential]\n\thelper = !${WORK}/.git/evil.sh\n`)
  git(ws, 'config', 'core.fsmonitor', `${WORK}/.git/evil.sh`)
  git(ws, 'config', 'core.sshCommand', `${WORK}/.git/evil.sh`)
  git(ws, 'config', 'include.path', `${WORK}/.git/evil.cfg`)
  // Planted after the commits, so the host's own git never ran them.
  git(ws, 'config', 'core.hooksPath', `${WORK}/.git/evil-hooks`)
}

/** A CA and a certificate for github.com signed by it, so the executor's git trusts the stand-in. */
function makeCertificates(fake: string) {
  const ssl = (...args: string[]) => execFileSync('openssl', args, { cwd: fake, stdio: 'pipe' })
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '1', '-subj', '/CN=wf-lane-4d test CA')
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=github.com')
  writeFileSync(join(fake, 'ext.cnf'), 'subjectAltName=DNS:github.com,DNS:api.github.com\n')
  ssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '1', '-extfile', 'ext.cnf')
  for (const f of ['server.key', 'server.crt', 'ca.crt']) chmodSync(join(fake, f), 0o644)
}

type Step = { run: string; secrets: string[] }

function stepsOf(source: StarterSource): Step[] {
  return (source.definition.steps as { run: string; secrets?: string[] }[]).map((s) => ({ run: s.run, secrets: s.secrets ?? [] }))
}

/** Writes the version's files where a step finds them, as the site does, with a `./file` run pointed there. */
function approvedFiles(source: StarterSource): string {
  const wf = join(dir, `workflow-${String(source.definition.name)}`)
  if (existsSync(wf)) return wf
  mkdirSync(wf)
  for (const f of source.files) {
    writeFileSync(join(wf, f.path), f.text)
    chmodSync(join(wf, f.path), f.executable ? 0o755 : 0o644)
  }
  return wf
}
const commandFor = (run: string) => run.replace(/^\.\/([\w.-]+)/, '/run/workflow/$1')

function runStep(source: StarterSource, step: Step, ws: string): { status: number; output: string } {
  const holds = step.secrets.length > 0
  const args = [
    'run', '--rm', '-i', '--name', NAME, '--memory', '2g', '--cpus', '2',
    '--user', '1001:1001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only', '--init',
    // `exec`: Docker mounts a tmpfs noexec unless told otherwise, and push-bundle runs its askpass from /tmp.
    '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=256m,mode=1777',
    '--network', 'none', '--add-host', 'github.com:127.0.0.1', '--sysctl', 'net.ipv4.ip_unprivileged_port_start=0',
    '-e', 'HOME=/tmp/home', '-e', 'XDG_CONFIG_HOME=/tmp/home/.config', '-e', 'GH_CONFIG_DIR=/tmp/home/.config/gh',
    // What the site is to set from the run instruction's repository (see the lane report).
    '-e', 'GITHUB_REPOSITORY=acme/site', '-e', 'GITHUB_REPOSITORY_URL=https://github.com/acme/site.git',
    '-v', `${approvedFiles(source)}:/run/workflow:ro`,
    '-v', `${join(dir, 'out')}:/run/out:rw`,
    '-v', `${join(dir, 'params')}:/run/params:ro`,
    '-v', `${ws}:${WORK}:${holds ? 'ro' : 'rw'}`,
    '-w', WORK,
  ]
  if (holds) {
    args.push('-v', `${join(dir, 'secrets')}:/run/secrets:ro`, '-v', `${join(dir, 'fake')}:/fake:ro`,
      '-v', `${join(dir, 'srv')}:/srv/git:rw`, '-v', `${join(dir, 'fake', 'ca.crt')}:/etc/ssl/certs/ca-certificates.crt:ro`)
  }
  const boot = holds
    ? 'node /fake/fakeGitHub.cjs & for i in $(seq 100); do [ -e /tmp/fake-github-ready ] && break; sleep 0.1; done; mkdir -p "$HOME" "$GH_CONFIG_DIR"; exec </dev/null; exec bash --noprofile --norc -eo pipefail -c "$1"'
    : 'mkdir -p "$HOME" "$GH_CONFIG_DIR"; exec </dev/null; exec bash --noprofile --norc -eo pipefail -c "$1"'
  args.push(IMAGE, 'sh', '-c', boot, 'step', commandFor(step.run))
  const r = spawnSync('docker', args, { encoding: 'utf8', input: '' })
  return { status: r.status ?? -1, output: `${r.stdout}${r.stderr}` }
}

function filesUnder(root: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name)
    if (e.isDirectory()) out.push(...filesUnder(p))
    else if (e.isFile()) out.push(p)
  }
  return out
}
const holdsCanary = (root: string) => filesUnder(root).filter((f) => readFileSync(f).includes(CANARY))
const evilLog = () => (existsSync(join(dir, 'out', 'evil.log')) ? readFileSync(join(dir, 'out', 'evil.log'), 'utf8') : '')

describe.skipIf(!ON)('A13, git: the starters run git with the token only in a clean repository @SC-1320', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-lane-4d-'))
    for (const d of ['out', 'params', 'secrets', 'fake', 'srv/acme']) mkdirSync(join(dir, d), { recursive: true })
    for (const d of ['out', 'srv', 'srv/acme']) chmodSync(join(dir, d), 0o777)
    writeFileSync(join(dir, 'params', 'branch'), 'feature/x')
    writeFileSync(join(dir, 'secrets', 'GITHUB_TOKEN'), CANARY)
    chmodSync(join(dir, 'secrets', 'GITHUB_TOKEN'), 0o644)
    const auth = `Basic ${Buffer.from(`x-access-token:${CANARY}`).toString('base64')}`
    writeFileSync(join(dir, 'fake', 'expected-auth'), createHash('sha256').update(auth).digest('hex'))
    cpSync(join(__dirname, 'containers', 'fakeGitHub.cjs'), join(dir, 'fake', 'fakeGitHub.cjs'))
    makeCertificates(join(dir, 'fake'))
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', join(dir, 'srv', 'acme', 'site.git')])
    execFileSync('chmod', ['-R', 'a+rwX', join(dir, 'srv')])
  }, 60_000)

  afterAll(() => {
    spawnSync('docker', ['rm', '-f', NAME])
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('push: the branch arrives, no planted hook or config runs with the token, and the token is nowhere', () => {
    const ws = join(dir, 'push-ws')
    plantWorkspace(ws)
    execFileSync('chmod', ['-R', 'a+rwX', ws])
    const source = starterSource('push')
    const [bundle, push] = stepsOf(source)

    const one = runStep(source, bundle, ws)
    expect(one.status, one.output).toBe(0)
    const afterBundle = evilLog()
    expect(afterBundle).not.toContain(CANARY)

    const two = runStep(source, push, ws)
    expect(two.status, two.output).toBe(0)
    expect(two.output).not.toContain(CANARY)
    // Nothing planted ran in the step with the token: the log is as the step with no secret left it.
    expect(evilLog()).toBe(afterBundle)

    const head = git(ws, 'rev-parse', 'refs/heads/feature/x')
    expect(execFileSync('git', ['--git-dir', join(dir, 'srv', 'acme', 'site.git'), 'rev-parse', 'refs/heads/feature/x'], { encoding: 'utf8' }).trim()).toBe(head)
    expect(holdsCanary(join(dir, 'out'))).toEqual([])
    expect(holdsCanary(ws)).toEqual([])
    expect(holdsCanary(join(dir, 'srv'))).toEqual([])
  }, 120_000)

  it('pull: the branch is fetched in a clean repository and brought into the workspace, with the same guarantees', () => {
    const upstream = join(dir, 'upstream')
    git(dir, 'clone', '-q', join(dir, 'srv', 'acme', 'site.git'), upstream)
    git(upstream, 'checkout', '-q', 'feature/x')
    writeFileSync(join(upstream, 'from-github.txt'), 'upstream\n')
    git(upstream, 'add', '-A')
    git(upstream, 'commit', '-q', '-m', 'three')
    git(upstream, 'push', '-q', 'origin', 'feature/x')
    const wanted = git(upstream, 'rev-parse', 'HEAD')

    const ws = join(dir, 'push-ws')
    rmSync(join(dir, 'out', 'push.bundle'), { force: true })
    const source = starterSource('pull')
    const [fetch, update] = stepsOf(source)
    const before = evilLog()

    const one = runStep(source, fetch, ws)
    expect(one.status, one.output).toBe(0)
    expect(one.output).not.toContain(CANARY)
    expect(evilLog()).toBe(before)
    expect(statSync(join(dir, 'out', 'pull.bundle')).size).toBeGreaterThan(0)
    expect(holdsCanary(join(dir, 'out'))).toEqual([])

    const two = runStep(source, update, ws)
    expect(two.status, two.output).toBe(0)
    expect(git(ws, 'rev-parse', 'refs/heads/feature/x')).toBe(wanted)
    // The plants are live: git in the workspace, in the step with no secret, ran them, and they found no token.
    expect(evilLog()).toMatch(/^ran \/workspace\/\.git\/evil-hooks\//m)
    expect(evilLog()).not.toContain(CANARY)
    expect(holdsCanary(ws)).toEqual([])
  }, 120_000)
})
