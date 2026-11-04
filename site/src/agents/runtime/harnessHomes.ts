/**
 * Harness homes: the runtime's private state for one runner in one boundary
 * (person-scoped execution spec §1, ADR-0074).
 *
 * They live on the site's disk BESIDE storage, never inside it. Project storage
 * is mounted by every container in the project, so a home inside it would be
 * readable by all of them:
 *
 *   <site root>/homes/
 *     users/<person id>/personal/      the person, in their own storage
 *     users/<person id>/<project id>/  the person, in a project
 *     projects/<project id>/           the project's own runs
 *
 * Grouped by person, so everything private to one person is one folder:
 * removing them from the organisation removes `users/<person id>/`, and from a
 * project the one folder below it. The project's own home is never mounted into
 * a member's container.
 *
 * A home is runtime-neutral. The whole folder is bound at the user's home
 * directory inside the container (`HARNESS_HOME_CONTAINER_DIR`), so Claude's
 * `.claude/` and `~/.claude.json`, and later OpenCode's `.local/share/opencode/`,
 * sit side by side in it without a bind per runtime.
 *
 * Per-boundary homes from before this layout (`homes/project-<id>`,
 * `homes/user-<id>`) are ignored, not converted.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { CapabilityRunner } from '@agenthix/core'
import { getSiteRoot } from '../agentDiskPaths'
import type { ContainerKey, StorageBoundaryKey } from './containerTypes'

/** Where a home is bound inside every container: the image user's home directory. */
export const HARNESS_HOME_CONTAINER_DIR = '/home/appuser'

/**
 * The agent image's own user (`USER` in agent.Dockerfile), whose home that is.
 * Anything the site runs in a container that must see the harness's processes
 * runs as it: root there cannot read another user's process environment.
 */
export const AGENT_IMAGE_USER = 'appuser'

const HOMES_DIRNAME = 'homes'
/** The folder a person's home in their own storage is named. Never a project id. */
const PERSONAL_DIRNAME = 'personal'

/**
 * One path segment built from an id, refused rather than transformed when it
 * is not a plain name. These paths are deleted recursively when a person
 * leaves (lane 5), so an id that could name the parent (`..`), the folder
 * itself (`.`) or a nested path has to stop here, not be rewritten into
 * something that might be another folder.
 */
function idSegment(value: string, what: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) || value.includes('..')) {
    throw new Error(`Refusing a harness home for an unsafe ${what}`)
  }
  return value
}

function homesRoot(): string {
  return path.join(getSiteRoot(), HOMES_DIRNAME)
}

/**
 * Run staging (adr-0173): what the site checks and hands to one runner's runs in one boundary, which they may read
 * but never change — the run's checked skills (`skills/`, which the harness loads) and each conversation's pinned
 * memory (`pinned-memory/`). Laid out like `homes/`, site-only, and mounted read-only at `RUN_STAGING_CONTAINER_DIR`
 * on the container's read-only root, never inside the writable harness home: a run could move a folder of its home
 * aside, and the harness would then load a version of a skill the site never checked.
 */
const RUN_STAGING_DIRNAME = 'run-staging'

/** Where a runner's run staging is mounted, read-only, in every container. */
export const RUN_STAGING_CONTAINER_DIR = '/run/staging'

function runStagingRoot(): string {
  return path.join(getSiteRoot(), RUN_STAGING_DIRNAME)
}

/** `homes/users/<person id>/` — every home that belongs to one person. */
export function personHarnessHomesRoot(userId: string): string {
  return path.join(homesRoot(), 'users', idSegment(userId, 'person id'))
}

/** `run-staging/users/<person id>/`: every run staging that belongs to one person. */
export function personRunStagingRoot(userId: string): string {
  return path.join(runStagingRoot(), 'users', idSegment(userId, 'person id'))
}

/** The person, running in their own storage. */
export function personalHarnessHome(userId: string): string {
  return path.join(personHarnessHomesRoot(userId), PERSONAL_DIRNAME)
}

/** The person, running in a project. */
export function personProjectHarnessHome(userId: string, projectId: string): string {
  const segment = idSegment(projectId, 'project id')
  if (segment === PERSONAL_DIRNAME) throw new Error('Refusing a harness home for an unsafe project id')
  return path.join(personHarnessHomesRoot(userId), segment)
}

/** The project's own runs — tasks, which nobody is behind. */
export function projectHarnessHome(projectId: string): string {
  return path.join(homesRoot(), 'projects', idSegment(projectId, 'project id'))
}

/**
 * A folder of the runner layout (`homes/` or `run-staging/`) as `{ parent, name }`: the site removes it as the entry
 * `name` of `parent`, a folder no container can write (membershipEnding.ts).
 */
export type RunnerFolder = { parent: string; name: string }

export const asEntry = (folder: string): RunnerFolder => ({ parent: path.dirname(folder), name: path.basename(folder) })

/** The person's run staging in a project, as the entry of its parent. */
export function personProjectRunStaging(userId: string, projectId: string): RunnerFolder {
  return asEntry(path.join(personRunStagingRoot(userId), path.basename(personProjectHarnessHome(userId, projectId))))
}

/** Every run staging that belongs to one person, as one entry. */
export function personRunStagings(userId: string): RunnerFolder {
  return asEntry(personRunStagingRoot(userId))
}

/** The person's harness home in a project, and all of a person's homes, as entries. */
export function personProjectHomeEntry(userId: string, projectId: string): RunnerFolder {
  return asEntry(personProjectHarnessHome(userId, projectId))
}

export function personHomesEntry(userId: string): RunnerFolder {
  return asEntry(personHarnessHomesRoot(userId))
}

/** The run staging of one container's runner, as the site server sees it: the home's own path under `run-staging/`. */
export function runStagingFor(key: ContainerKey): string {
  return path.join(runStagingRoot(), path.relative(homesRoot(), harnessHomeFor(key)))
}

/**
 * Every home that belongs to one project: the project's own, and each member's
 * `homes/users/<person id>/<project id>/` that exists on this disk. The
 * project's own is always listed, whether or not it exists yet — removing a
 * path that is not there is not an error.
 */
export async function projectHarnessHomes(projectId: string): Promise<string[]> {
  return projectRunnerFolders(homesRoot(), projectId)
}

/** The same for run staging: the project's own and each member's in the project, as entries to remove. */
export async function projectRunStagings(projectId: string): Promise<RunnerFolder[]> {
  return (await projectRunnerFolders(runStagingRoot(), projectId)).map(asEntry)
}

async function projectRunnerFolders(root: string, projectId: string): Promise<string[]> {
  const homes = [path.join(root, 'projects', idSegment(projectId, 'project id'))]
  let people: string[]
  try {
    const entries = await fs.readdir(path.join(root, 'users'), { withFileTypes: true })
    people = entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return homes
    throw err
  }
  for (const person of people) {
    let home: string
    try {
      home = path.join(root, path.relative(homesRoot(), personProjectHarnessHome(person, projectId)))
    } catch {
      continue // a folder no id could have produced; not one of ours to list
    }
    const stat = await fs.lstat(home).catch(() => null)
    if (stat?.isDirectory()) homes.push(home)
  }
  return homes
}

/**
 * Why a storage key's runner cannot be in it, or null. Checked again here —
 * the launch already applied core's rule to the signed claim — because this
 * is where a home is chosen, and a runner that does not fit its boundary is a
 * way into someone else's home.
 */
export function runnerKeyMismatch(key: StorageBoundaryKey): string | null {
  const { runner } = key
  if (key.ownerType === 'user') {
    return runner.kind === 'person' && runner.userId === key.ownerId
      ? null
      : "only the owner of a person's own storage can run in it"
  }
  if (runner.kind === 'project' && runner.projectId !== key.ownerId) {
    return 'the project runner names a different project'
  }
  return null
}

export function assertRunnerFitsKey(key: StorageBoundaryKey): void {
  const mismatch = runnerKeyMismatch(key)
  if (mismatch) throw new Error(`Refusing a container for a runner that does not fit its boundary: ${mismatch}`)
}

/** The harness home one container's runs get, as the site server sees it. */
export function harnessHomeFor(key: ContainerKey): string {
  assertRunnerFitsKey(key)
  return harnessHomeForRunner(key.ownerType, key.ownerId, key.runner)
}

function harnessHomeForRunner(ownerType: 'project' | 'user', ownerId: string, runner: CapabilityRunner): string {
  if (ownerType === 'user') return personalHarnessHome(ownerId)
  return runner.kind === 'person'
    ? personProjectHarnessHome(runner.userId, ownerId)
    : projectHarnessHome(ownerId)
}
