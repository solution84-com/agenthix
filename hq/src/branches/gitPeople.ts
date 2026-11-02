/**
 * Who a commit names (live preview spec, *Defaults for review* 1): an agent's commits name the agent as author and the
 * person the work is for in an `On-behalf-of:` line; a merge, a restore and the first version name the person who
 * pressed it, or who told the agent to. People sign in with a login name and have no address, so each is given one
 * under HQ's own host name, which says who it is and reaches no one.
 */
import type { GitPerson } from '@agenthix/core'
import { isGitEmail, isGitPersonName } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { personById } from '../server/identity/people'

const FALLBACK_HOST = 'hq.invalid'

/** HQ's own host name, from the address it serves at. */
export function hqHost(serverUrl: string | undefined = process.env.WASP_SERVER_URL): string {
  try {
    const host = serverUrl ? new URL(serverUrl).hostname : ''
    return /^[a-z0-9.-]+$/i.test(host) && host.includes('.') ? host.toLowerCase() : FALLBACK_HOST
  } catch {
    return FALLBACK_HOST
  }
}

/** A name Git can write: without `<`, `>` and control characters, never blank. */
export function gitName(name: string, fallback: string): string {
  const clean = name.replace(/[<>\x00-\x1f\x7f]/g, '').trim().slice(0, 200)
  return isGitPersonName(clean) ? clean : fallback
}

function local(part: string): string {
  const clean = part.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return clean || 'someone'
}

export function gitPersonOf(name: string, localPart: string, kind: 'people' | 'agents', host = hqHost()): GitPerson {
  const email = `${local(localPart)}@${kind}.${host}`
  return { name: gitName(name, localPart), email: isGitEmail(email) ? email : `someone@${kind}.${FALLBACK_HOST}` }
}

export async function gitPersonForUser(userId: string): Promise<GitPerson> {
  const person = await personById(userId)
  return gitPersonOf(person.name, person.handle ?? userId, 'people')
}

export async function gitPersonForAgent(agentId: string): Promise<GitPerson> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true, handle: true } })
  return gitPersonOf(agent?.name ?? 'Agent', agent?.handle ?? agentId, 'agents')
}
