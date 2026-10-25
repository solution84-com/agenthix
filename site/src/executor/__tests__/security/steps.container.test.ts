/**
 * Control checks for a run's steps, in real executor containers (workflows spec part 6): A2, a step that installs
 * packages holds no secret it does not name; A3, nothing one step leaves running reaches the next; A8, the approved
 * files are read-only inside every step. Each step checks its control itself and exits with a number of its own
 * when it does not hold; the run is the site's own (`startRun`), with canaries for secrets.
 *
 * Run with `npm run test:container` from site/. Needs Docker and the executor image (EXECUTOR_TEST_IMAGE,
 * `imgtest/executor:dev` by default); skipped when either is missing.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

process.env.HOST_NAMESPACE = 'wf-lane-6b'

const db = vi.hoisted(() => ({ runs: new Map<string, Record<string, unknown>>() }))
vi.mock('#db', () => ({
  prisma: {
    workspace: { findUnique: async () => ({ id: 'ws-1', ownerType: 'project', ownerId: 'proj-1' }) },
    executorRun: {
      count: async ({ where }: { where: { id: string } }) => (db.runs.has(where.id) ? 1 : 0),
      create: async ({ data }: { data: Record<string, unknown> }) => { db.runs.set(data.id as string, { ...data, state: 'RUNNING' }) },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        db.runs.set(where.id, { ...db.runs.get(where.id), ...data })
      },
      findUnique: async ({ where }: { where: { id: string } }) => db.runs.get(where.id) ?? null,
      findMany: async () => [],
    },
    executorSnapshot: { create: async () => {}, updateMany: async () => {}, findMany: async () => [] },
  },
}))
vi.mock('../../runEvents', () => ({ sendStepEvent: () => {}, sendResult: () => {} }))

import { executorDeps, resetExecutorForTests } from '../../run'
import { listStepContainers } from '../../runCleanup'
import { removeContainer } from '../../stepRunner'
import { b64, CANARY, CANARY_B, definition, instruction, tempDir, writeTree } from '../fixtures'
import { EXECUTOR_IMAGE, imageId, runToEnd } from './harness'

const IMAGE_ID = imageId(EXECUTOR_IMAGE)
const original = { ...executorDeps }
let siteRoot: string

const holdsKey = { name: 'Upload', run: 'test -s /run/secrets/STAGING_DEPLOY_KEY', secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: 60 }
const holdsPassword = { name: 'Migrate', run: 'test -s /run/secrets/DB_PASSWORD', secrets: ['DB_PASSWORD'], timeoutSeconds: 60 }
const file = (p: string, text: string) => ({ path: p, contentBase64: b64(text), executable: true })

// Run by npm as the package's own postinstall script.
const POSTINSTALL = `#!/bin/sh
test -z "$(ls -A /run/secrets)" || exit 31
if env | grep -q -e '${CANARY}' -e '${CANARY_B}'; then exit 32; fi
for e in /proc/[0-9]*/environ; do
  if grep -qa -e '${CANARY}' -e '${CANARY_B}' "$e" 2>/dev/null; then exit 33; fi
done
echo checked > /run/out/postinstall-ran
`
const PACKAGE = JSON.stringify({ name: 'install-check', version: '1.0.0', private: true, scripts: { postinstall: 'sh ./postinstall.sh' } })

// A shell function: whether any process has `lingering-6b` as one whole argument (never true of the script that asks).
const LINGERING = String.raw`lingering() { for f in /proc/[0-9]*/cmdline; do a=$'\n'"$(tr '\0' '\n' < "$f" 2>/dev/null || true)"$'\n'; case "$a" in *$'\n'lingering-6b$'\n'*) return 0;; esac; done; return 1; }`

describe.skipIf(!IMAGE_ID)('control checks for a run\'s steps, in real containers @SC-1344', () => {
  beforeAll(() => { executorDeps.resolveImage = async digest => (digest === IMAGE_ID ? IMAGE_ID : null) })

  beforeEach(async () => {
    resetExecutorForTests()
    db.runs.clear()
    siteRoot = await tempDir('control-checks-')
    process.env.SITE_ROOT = siteRoot
    await writeTree(path.join(siteRoot, 'projects/proj-1/workspaces/ws-1'), { 'README.md': 'hello' })
    executorDeps.scanRunChanges = async () => ({ leaks: [] })
  })

  afterEach(async () => {
    Object.assign(executorDeps, { ...original, resolveImage: executorDeps.resolveImage })
    for (const name of await listStepContainers()) await removeContainer(name)
    await fs.rm(siteRoot, { recursive: true, force: true })
  })

  it('A2: a step that installs packages, between two steps that hold secrets, holds none and has no canary in any environment', async () => {
    const install = {
      name: 'Install',
      run: 'cp -R /run/workflow/pkg /tmp/pkg && cd /tmp/pkg && npm install --offline --no-audit --no-fund && test -e /run/out/postinstall-ran',
      secrets: [], timeoutSeconds: 120,
    }
    const d = definition({ steps: [holdsKey, install, holdsPassword], files: ['pkg/package.json', 'pkg/postinstall.sh'] })
    const r = await runToEnd(await instruction({
      runId: 'run-a2', executorImageDigest: IMAGE_ID, definition: d,
      files: [file('pkg/package.json', PACKAGE), file('pkg/postinstall.sh', POSTINSTALL)],
    }))
    expect(r.steps.map(s => [s.state, s.exitCode])).toEqual([['passed', 0], ['passed', 0], ['passed', 0]])
  })

  it('A3: a process a step leaves running is gone before the next step starts, in a fresh container', async () => {
    const leave = {
      name: 'Leave',
      run: `${LINGERING}; nohup bash -c 'while :; do sleep 1; done' lingering-6b >/dev/null 2>&1 & hostname > /run/out/host; touch /tmp/left-by-step-1; sleep 1; lingering || exit 44`,
      secrets: [], timeoutSeconds: 60,
    }
    const next = {
      name: 'Next',
      run: [
        LINGERING,
        'if lingering; then exit 41; fi',
        'if test "$(hostname)" = "$(cat /run/out/host)"; then exit 42; fi',
        'if test -e /tmp/left-by-step-1; then exit 43; fi',
        'test -s /run/secrets/STAGING_DEPLOY_KEY',
      ].join('; '),
      secrets: ['STAGING_DEPLOY_KEY'], timeoutSeconds: 60,
    }
    const d = definition({ steps: [leave, next], files: [] })
    const r = await runToEnd(await instruction({ runId: 'run-a3', executorImageDigest: IMAGE_ID, definition: d, files: [] }))
    expect(r.steps.map(s => [s.state, s.exitCode])).toEqual([['passed', 0], ['passed', 0]])
    expect(await listStepContainers()).toEqual([])
  })

  it('A8: /run/workflow is read-only inside a step, with a secret or without', async () => {
    const check = [
      'grep -qE "^[^ ]+ /run/workflow [^ ]+ ro[, ]" /proc/mounts || exit 51',
      'if touch /run/workflow/added 2>/dev/null; then exit 52; fi',
      'if echo changed >> /run/workflow/deploy/upload.sh 2>/dev/null; then exit 53; fi',
      'if rm -f /run/workflow/deploy/upload.sh 2>/dev/null && test ! -e /run/workflow/deploy/upload.sh; then exit 54; fi',
      'if chmod 777 /run/workflow/deploy/upload.sh 2>/dev/null; then exit 55; fi',
      'test "$(cat /run/workflow/deploy/upload.sh)" = "$(printf \'#!/bin/sh\\necho uploading\')"',
    ].join('; ')
    const d = definition({
      steps: [{ name: 'Plain', run: check, secrets: [], timeoutSeconds: 60 }, { ...holdsKey, run: check }],
      files: ['deploy/upload.sh'],
    })
    const r = await runToEnd(await instruction({ runId: 'run-a8', executorImageDigest: IMAGE_ID, definition: d }))
    expect(r.steps.map(s => [s.state, s.exitCode])).toEqual([['passed', 0], ['passed', 0]])
  })
})
