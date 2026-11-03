import { DEFAULT_INSTALL_NAMESPACE, type CapabilityRunner } from '@agenthix/core'
import type { ContainerKey, ContainerContext } from './containerTypes'
import { assertRunnerFitsKey } from './harnessHomes'

/** What Docker allows of a name's prefix, as the host service records a namespace. */
const VALID_NAMESPACE = /^[a-z][a-z0-9-]{0,30}$/
/** Development's own, when no host service runs the site: its containers are `agenthix-dev-*`. */
const DEV_NAMESPACE = `${DEFAULT_INSTALL_NAMESPACE}-dev`

/**
 * The install's recorded namespace, which the host service passes as HOST_NAMESPACE (`host/src/compose/projects.ts`).
 * Every name and label the site gives the containers and networks it starts comes from it, never from the product's
 * name, so an install keeps its names through a rename. Development's own when no host service set one.
 */
export function siteNamespace(): string {
  const ns = process.env.HOST_NAMESPACE
  if (!ns) return DEV_NAMESPACE
  if (!VALID_NAMESPACE.test(ns)) throw new Error(`HOST_NAMESPACE is not a namespace a host service records: "${ns}"`)
  return ns
}

/** A label of the site's own: `<namespace>.<key>`. */
export function labelKey(key: string): string {
  return `${siteNamespace()}.${key}`
}

const SITE_ID = /^[A-Za-z0-9_.-]{1,64}$/
let containerSiteId: string | null = null

/**
 * This site's own id (`SiteConfig.siteId`), set once at boot before any container is made. Every container and network
 * the site makes carries it as `<namespace>.site`, and every sweep removes only what carries it, so two sites sharing
 * one Docker, even with one namespace, never remove each other's. Unset (in tests), nothing is labelled or filtered by it.
 */
export function setContainerSiteId(siteId: string): void {
  if (!SITE_ID.test(siteId)) throw new Error(`Not a site id a label can carry: ${JSON.stringify(siteId)}`)
  containerSiteId = siteId
}

export function clearContainerSiteIdForTests(): void {
  containerSiteId = null
}

export const siteIdLabelKey = (): string => labelKey('site')

/** The site's own label, as a label map; empty before the site's id is set. */
export function siteIdLabel(): Record<string, string> {
  return containerSiteId ? { [siteIdLabelKey()]: containerSiteId } : {}
}

/** `--label` arguments for the site's own label. */
export function siteIdLabelArgs(): string[] {
  return containerSiteId ? ['--label', `${siteIdLabelKey()}=${containerSiteId}`] : []
}

/** `--filter` arguments that keep a `docker ps` / `network ls` / `events` to what this site made. */
export function siteIdFilterArgs(): string[] {
  return containerSiteId ? ['--filter', `label=${siteIdLabelKey()}=${containerSiteId}`] : []
}

/**
 * The group the agents a site starts are in: `<namespace>-agents`, set as their `com.docker.compose.project` label,
 * which Docker Desktop groups containers by. They are started with `docker run`, so nothing sets it for them.
 *
 * Never the site's own project: the host service brings that up with `--remove-orphans`, so a site's upgrade would
 * remove its running agents as orphans. Nor `agenthix-dev`, the repository's development compose project, for the
 * same reason. Erasing the site or uninstalling takes this whole group down.
 */
export function resolveComposeProjectName(): string {
  return `${siteNamespace()}-agents`
}

export function composeProjectLabelArgs(service: string): string[] {
  const project = resolveComposeProjectName()
  return [
    '--label', `com.docker.compose.project=${project}`,
    '--label', `com.docker.compose.service=${service}`,
    ...siteIdLabelArgs(),
  ]
}

/**
 * The agent containers' name prefix, `<namespace>-agent` (`agenthix-dev-agent` in development). Only names them: no
 * sweep finds a container by it, since two sites on one Docker can share it. A second development site beside the
 * first sets its own HOST_NAMESPACE, so its names differ too.
 */
export function resolveContainerPrefix(): string {
  return `${siteNamespace()}-agent`
}

/**
 * The identifying segment of a container name — an owner id or a runner's id. Owner ids are system-generated uuids and handles are
 * already validated, so this is a guard rather than a transformation: a Docker
 * name may only hold `[a-zA-Z0-9][a-zA-Z0-9_.-]*`, and a name built from an id
 * that slipped something else in would either be refused by the daemon or,
 * worse, collide with another container's. Anything outside that set
 * becomes '-'.
 *
 * Harness homes do not use it: a home path is deleted recursively when a
 * person leaves, so harnessHomes.ts refuses an unsafe id outright rather than
 * rewriting it.
 */
export function nameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '-')
}

/**
 * The container's name — ADR-0074: boundary × runner, plus the mode.
 *
 *  - a person's own storage: `<prefix>-user-<ownerId>-<mode>`. Its only runner
 *    is its owner, so this is the one container it always had.
 *  - a project: `<prefix>-project-<projectId>-user-<personId>-<mode>` for a
 *    member, `<prefix>-project-<projectId>-project-<mode>` for the project's
 *    own runs. Alice × X, Bob × X and X × project are three containers.
 *
 * No agent, no session, no task: that context rides in labels. Every segment
 * is an immutable id, so a rename changes no container name.
 */
export function containerNameFor(key: ContainerKey): string {
  const prefix = resolveContainerPrefix()
  assertRunnerFitsKey(key)
  const owner = `${key.ownerType}-${nameSegment(key.ownerId)}`
  if (key.ownerType === 'user') return `${prefix}-${owner}-${key.mode}`
  const runner = key.runner.kind === 'person' ? `user-${nameSegment(key.runner.userId)}` : 'project'
  return `${prefix}-${owner}-${runner}-${key.mode}`
}

/** The `<namespace>.runner` label's value: `user:<person id>` or `project:<project id>`. */
export function runnerLabelValue(runner: CapabilityRunner): string {
  return runner.kind === 'person' ? `user:${runner.userId}` : `project:${runner.projectId}`
}

/**
 * The `--label` arguments for a `docker run` (moved out of
 * AgentContainerManager._start to keep that file under the repo's file-size
 * limit). ADR-0049's rule, kept by ADR-0057: the agent, session, invoker and
 * task ride in labels, never in the name — searchable with `docker ps
 * --filter label=...`. They record the run that last (re)created this
 * container, not what it belongs to.
 *
 * `<namespace>.owner` is the boundary itself, stamped so both sweeps can key on
 * it without parsing a container name.
 *
 * `<namespace>.runner` is who the container is for (ADR-0074), stamped so a
 * person's or a project's containers can be found and removed without parsing
 * a name (`removeContainersFor`).
 */
export function containerRunLabels(key: ContainerKey, ctx: ContainerContext): string[] {
  const owner = `${key.ownerType}:${key.ownerId}`
  return [
    '--label', `${labelKey('owner')}=${owner}`,
    '--label', `${labelKey('runner')}=${runnerLabelValue(key.runner)}`,
    '--label', `${labelKey('session')}=${ctx.sessionId}`,
    '--label', `${labelKey('agent')}=${ctx.handle}`,
    ...(ctx.invokerUserId ? ['--label', `${labelKey('invoker')}=${ctx.invokerUserId}`] : []),
    ...(ctx.taskId ? ['--label', `${labelKey('task')}=${ctx.taskId}`] : []),
  ]
}
