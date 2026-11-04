/**
 * No run mounts knowledge (agent knowledge spec, part 6, V7; part 4, B1): a run's container, started with the site's
 * own mounts and `docker run` arguments for a project and for a person, has no bind reaching the knowledge store
 * (`{storage}/knowledge/…`), and nothing inside it reads a page's text. A run reaches knowledge only through the
 * knowledge tools, which ask hq.
 *
 * Run with `npm run test:container` from site/. Needs Docker and the agent image (AGENT_TEST_IMAGE,
 * `imgtest/agent:dev` by default); skipped when either is missing, which the security suite counts as a failure.
 * One container at a time, capped at 2 GB and 2 CPUs on a network of its own, removed at the end. Calls no model.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { KnowledgeOwnerRef } from '@agenthix/core'
import { getSiteRoot } from '../../../agents/agentDiskPaths'
import { prepareHarnessHome } from '../../../agents/runtime/boundaryClaudeHome'
import { prepareRunStaging } from '../../../agents/runtime/runStaging'
import { buildContainerRunCommand } from '../../../agents/runtime/containerRunArgs'
import { resolveAccessibleLocations, resolveBoundaryMount } from '../../../agents/runtime/locationResolver'
import { prepareOpenCodeConfigMounts } from '../../../agents/runtime/openCodeConfigMounts'
import type { AgentMounts, StorageBoundaryKey } from '../../../agents/runtime/containerTypes'
import { knowledgePagesDir } from '../../storage/paths'
import { writePage } from '../gate'
import { page } from './knowledgeFixtures'

const IMAGE = process.env.AGENT_TEST_IMAGE ?? 'imgtest/agent:dev'
const NAME = process.env.KNOWLEDGE_MOUNT_TEST_CONTAINER ?? 'knowledge-mount-check-agent'
const NET = `${NAME}-net`
const available = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0

const MARK = `knowledge-mark-${randomBytes(6).toString('hex')}`
const CONTROL = `files-mark-${randomBytes(6).toString('hex')}`

const PROJECT: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'proj-k7' }
const PERSON: KnowledgeOwnerRef = { ownerType: 'user', ownerId: 'user-k7' }
const ORG: KnowledgeOwnerRef = { ownerType: 'org', ownerId: 'org' }

type Run = { status: number | null; stdout: string; stderr: string }
function sh(cmd: string, args: string[], timeout = 120_000): Run {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** A command in the container as the image's user, with its arguments passed apart from the script. */
const inContainer = (script: string, ...args: string[]): Run => sh('docker', ['exec', '-u', 'appuser', NAME, 'sh', '-c', script, 'sh', ...args])

function removeContainer(): void {
  sh('docker', ['rm', '-f', NAME])
  sh('docker', ['network', 'rm', NET])
}

/** Whether `inner` is `outer` or anywhere below it. */
function within(inner: string, outer: string): boolean {
  const rel = path.relative(outer, inner)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Starts the container a run in this owner's storage gets, as `prepareAgentContainer` and `_start` build it. */
async function startRunContainer(key: StorageBoundaryKey): Promise<AgentMounts> {
  removeContainer()
  const owner = { ownerType: key.ownerType, ownerId: key.ownerId }
  await prepareHarnessHome(key)
  await prepareOpenCodeConfigMounts(key)
  await prepareRunStaging(key)
  const mounts: AgentMounts = {
    boundary: resolveBoundaryMount(owner, getSiteRoot()),
    folders: resolveAccessibleLocations({ ...owner }, getSiteRoot(), []),
    locationMode: key.mode,
  }
  await fs.mkdir(path.join(mounts.boundary.hostDir, 'files'), { recursive: true })
  await fs.writeFile(path.join(mounts.boundary.hostDir, 'files', 'control.md'), `${CONTROL}\n`)
  await fs.chmod(mounts.boundary.hostDir, 0o777)
  const net = sh('docker', ['network', 'create', NET])
  if (net.status !== 0) throw new Error(net.stderr)
  const { args } = buildContainerRunCommand(
    key, { handle: 'coder', runtime: 'claude', sessionId: 'sess-k7', credential: null }, NAME, mounts, NET,
    { memory: '2g', pidsLimit: '1024', cpus: '2' },
  )
  const run = sh('docker', args)
  if (run.status !== 0) throw new Error(run.stderr)
  return mounts
}

function mountsOf(): { source: string; destination: string }[] {
  const r = sh('docker', ['inspect', '--format', '{{json .Mounts}}', NAME])
  if (r.status !== 0) throw new Error(r.stderr)
  const mounts = JSON.parse(r.stdout) as { Source: string; Destination: string }[] | null
  return (mounts ?? []).map(m => ({ source: m.Source, destination: m.Destination }))
}

let root: string
const savedRoot = process.env.SITE_ROOT
const savedImage = process.env.AGENT_IMAGE

describe.skipIf(!available)('no run mounts knowledge (V7, B1) @SC-1384', () => {
  beforeAll(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-mount-')))
    process.env.SITE_ROOT = root
    process.env.AGENT_IMAGE = IMAGE
    for (const owner of [PROJECT, PERSON, ORG]) {
      const done = await writePage(owner, { page: 'processes/release.md', content: page('Release', `${MARK} is how we release.\n`), baseVersion: null })
      expect(done.outcome).toBe('done')
      expect(await fs.readFile(path.join(knowledgePagesDir(owner), 'processes/release.md'), 'utf8')).toContain(MARK)
    }
  }, 120_000)

  afterAll(async () => {
    removeContainer()
    if (savedRoot === undefined) delete process.env.SITE_ROOT
    else process.env.SITE_ROOT = savedRoot
    if (savedImage === undefined) delete process.env.AGENT_IMAGE
    else process.env.AGENT_IMAGE = savedImage
    if (root) await fs.rm(root, { recursive: true, force: true })
  })

  const runners: [string, StorageBoundaryKey][] = [
    ["a project's run", { scope: 'storage', ownerType: 'project', ownerId: PROJECT.ownerId, mode: 'rw', runner: { kind: 'project', projectId: PROJECT.ownerId } }],
    ["a person's run in their own storage", { scope: 'storage', ownerType: 'user', ownerId: PERSON.ownerId, mode: 'rw', runner: { kind: 'person', userId: PERSON.ownerId } }],
  ]

  it.each(runners)('%s has no bind reaching the knowledge store, and reads no page from inside', async (_who, key) => {
    const mounts = await startRunContainer(key)
    try {
      const store = path.join(root, 'knowledge')
      const binds = mountsOf()
      expect(binds.length).toBeGreaterThan(0)
      for (const { source } of binds) {
        expect(within(store, source), `${source} holds the knowledge store`).toBe(false)
        expect(within(source, store), `${source} is inside the knowledge store`).toBe(false)
      }

      // The owner's folder is bound, so its files are read from inside: the search below can find a marker.
      const control = inContainer('grep -rlsF -- "$1" "$2"', CONTROL, mounts.boundary.containerDir)
      expect(control.stdout).toContain('control.md')

      // Nothing bound into the container holds a page: no page of this owner, another owner or the organisation.
      for (const { destination } of binds) {
        const found = inContainer('grep -rlsF -- "$1" "$2"; true', MARK, destination)
        expect(found.stdout.trim(), `a page read under ${destination}`).toBe('')
      }
      // Where knowledge was kept before, inside the owner's folder, there is nothing to read.
      expect(inContainer('test -e "$1/knowledge"', mounts.boundary.containerDir).status).not.toBe(0)
    } finally {
      removeContainer()
    }
  })
})
