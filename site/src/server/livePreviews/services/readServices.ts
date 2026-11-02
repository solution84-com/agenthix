/**
 * Reading a live preview's services file (live preview spec section 4, *Services*): parsed in the commit helper's
 * container, which mounts only the copy, read-only, with no network and no Docker socket (`servicesParser.ts`), then
 * judged by core's `readServicesFile`, which only lets the fixed template's blanks through. Nothing is filled in from a
 * variable, and the file is never handed to `docker compose`.
 *
 * A service's name is its address on the services network, which the live preview's container is on beside its own.
 * So no service may take a name that container reaches something else by: anything of the site's namespace, the name
 * it is given for its site, or a container id.
 */
import { readServicesFile, type ServiceDeclaration, type ServiceProblem } from '@agenthix/core'
import { siteNamespace } from '../../../agents/runtime/containerLabels'
import { helperDeps, runHelper, type HelperDeps } from '../../branches/helperContainer'
import { SERVICES_PARSER } from './servicesParser'

const PARSE_MS = 30_000

export type ServicesRead =
  | { kind: 'absent' }
  | { kind: 'declared'; services: ServiceDeclaration[] }
  | { kind: 'refused'; problems: ServiceProblem[] }
  /** The helper could not run (the machine's protections, Docker); nothing is started. */
  | { kind: 'unreadable'; detail: string }

export async function readPreviewServices(lp: { workspaceId: string; hostDir: string }, deps: HelperDeps = helperDeps): Promise<ServicesRead> {
  const answer = await runHelper(
    { workspaceId: lp.workspaceId, copy: { dir: lp.hostDir, readOnly: true }, network: false, timeoutMs: PARSE_MS, program: SERVICES_PARSER },
    {},
    deps,
  )
  return judge(answer)
}

export function judge(answer: Record<string, unknown>): ServicesRead {
  if (answer.absent === true) return { kind: 'absent' }
  if (answer.refused === 'notAFile') {
    const message = typeof answer.detail === 'string' ? answer.detail.slice(0, 400) : 'The services file could not be read.'
    return { kind: 'refused', problems: [{ at: '', code: 'notAFile', message }] }
  }
  if (answer.ok !== true) {
    return { kind: 'unreadable', detail: `The services file could not be read on this site (${String(answer.refused ?? 'no answer')}).` }
  }
  const read = readServicesFile(answer.parsed)
  if (!read.ok) return { kind: 'refused', problems: read.problems }
  const taken = read.services.filter(d => isSiteName(d.name))
  if (taken.length) {
    return {
      kind: 'refused',
      problems: taken.map(d => ({
        at: `services.${d.name}`, code: 'badName' as const,
        message: `${d.name} is a name the live preview already reaches something else by; give the service another name, such as db.`,
      })),
    }
  }
  return { kind: 'declared', services: read.services }
}

/** The host of an explicit agent-facing address (`SITE_AGENT_URL`, as siteConfig.ts reads it). */
function siteHost(): string | null {
  try {
    return process.env.SITE_AGENT_URL?.trim() ? new URL(process.env.SITE_AGENT_URL.trim()).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/** A name the live preview's container already reaches something by on its own network. */
export function isSiteName(name: string): boolean {
  const ns = siteNamespace().toLowerCase()
  const site = process.env.SITE_CONTAINER_NAME?.toLowerCase()
  return name === ns || name.startsWith(`${ns}-`) || name === site || name === siteHost() || /^[0-9a-f]{12,}$/.test(name)
}
