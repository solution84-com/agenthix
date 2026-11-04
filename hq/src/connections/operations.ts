/**
 * A person's own connections to hq (adr-0090, agents own schedule spec §10):
 * create, list, renew, revoke. Every operation acts on the signed-in person's
 * own connections only — no one, an admin included, sees or changes another's.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetMyConnections, CreateConnection, RenewConnection, RevokeConnection } from 'wasp/server/operations'
import {
  CONNECTION_EXPIRY_DAYS, CONNECTION_GROUPS, DEFAULT_CONNECTION_EXPIRY_DAYS, isConnectionGroup,
  type ConnectionGroup, type ConnectionsOverview, type ConnectionView,
} from '../shared/connections'
import { isProjectMember } from '../projects/membership'
import { getSitePublicUrl } from '../server/siteConfig'
import { generateConnectionToken } from './connectionToken'
import { groupsOf } from './connectionAuth'

const MAX_NAME_LENGTH = 80
/** Enough for one per tool and one per project; a bound on what a leaked account can mint. */
const MAX_ACTIVE_CONNECTIONS = 25
const DAY_MS = 24 * 60 * 60 * 1000

type ConnectionRow = Awaited<ReturnType<typeof prisma.personConnection.findMany>>[number]

function requireUser(context: { user?: { id: string } }): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

function expiryFrom(now: Date, days: unknown): Date {
  const chosen = days === undefined ? DEFAULT_CONNECTION_EXPIRY_DAYS : days
  if (!(CONNECTION_EXPIRY_DAYS as readonly unknown[]).includes(chosen)) {
    throw new HttpError(400, `A connection lasts ${CONNECTION_EXPIRY_DAYS.join(', ')} days`)
  }
  return new Date(now.getTime() + (chosen as number) * DAY_MS)
}

async function toViews(rows: ConnectionRow[]): Promise<ConnectionView[]> {
  const ids = [...new Set(rows.flatMap(r => (r.allProjects ? [] : r.projectIds)))]
  const projects = ids.length
    ? await prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : []
  const nameOf = new Map(projects.map(p => [p.id, p.name]))
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    tokenPrefix: r.tokenPrefix,
    groups: CONNECTION_GROUPS.filter(g => groupsOf(r).has(g)),
    // A project deleted since keeps its place in the list, so the connection never widens.
    projects: r.allProjects ? null : r.projectIds.map(id => ({ id, name: nameOf.get(id) ?? 'A deleted project' })),
    expiresAt: r.expiresAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export const getMyConnections: GetMyConnections<void, ConnectionsOverview> = async (_args, context) => {
  const userId = requireUser(context)
  const rows = await prisma.personConnection.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return { connections: await toViews(rows), mcpUrl: `${getSitePublicUrl()}/mcp` }
}

type CreateConnectionArgs = {
  name: string
  groups: ConnectionGroup[]
  /** null or absent: every project the person can reach. */
  projectIds?: string[] | null
  expiresInDays?: number
}

export const createConnection: CreateConnection<CreateConnectionArgs, { token: string; connection: ConnectionView }> = async (
  args,
  context,
) => {
  const userId = requireUser(context)
  const name = typeof args.name === 'string' ? args.name.trim() : ''
  if (!name || name.length > MAX_NAME_LENGTH) throw new HttpError(400, `A connection needs a name of up to ${MAX_NAME_LENGTH} characters`)
  if (!Array.isArray(args.groups) || !args.groups.every(isConnectionGroup)) throw new HttpError(400, 'Unknown permission group')
  const groups = new Set(args.groups)
  if (groups.size === 0) throw new HttpError(400, 'Turn on at least one permission')

  const projectIds = await ownProjectList(userId, args.projectIds)
  const now = new Date()
  const expiresAt = expiryFrom(now, args.expiresInDays)

  await requireRoomForAnother(userId, now)

  const { token, tokenHash, tokenPrefix } = generateConnectionToken()
  const row = await prisma.personConnection.create({
    data: {
      userId, name, tokenHash, tokenPrefix, expiresAt,
      canRead: groups.has('read'),
      canChangeTasks: groups.has('change_tasks'),
      canStartWork: groups.has('start_work'),
      canManage: groups.has('manage'),
      allProjects: projectIds === null,
      projectIds: projectIds ?? [],
    },
  })
  const [connection] = await toViews([row])
  return { token, connection }
}

async function requireRoomForAnother(userId: string, now: Date): Promise<void> {
  const active = await prisma.personConnection.count({ where: { userId, revokedAt: null, expiresAt: { gt: now } } })
  if (active >= MAX_ACTIVE_CONNECTIONS) {
    throw new HttpError(400, `You already have ${MAX_ACTIVE_CONNECTIONS} connections; revoke one you no longer use first`)
  }
}

/** A project list can name only projects its person reaches today; null keeps it to all of them. */
async function ownProjectList(userId: string, projectIds: string[] | null | undefined): Promise<string[] | null> {
  if (projectIds === null || projectIds === undefined) return null
  if (!Array.isArray(projectIds) || projectIds.some(id => typeof id !== 'string')) throw new HttpError(400, 'Invalid project list')
  const unique = [...new Set(projectIds)]
  if (unique.length === 0) throw new HttpError(400, 'Choose at least one project, or all of them')
  for (const id of unique) {
    if (!(await isProjectMember(id, userId))) throw new HttpError(400, 'A connection can only be limited to projects you are a member of')
  }
  return unique
}

async function ownConnection(id: unknown, userId: string) {
  if (typeof id !== 'string') throw new HttpError(400, 'Invalid connection')
  const row = await prisma.personConnection.findUnique({ where: { id } })
  // Someone else's is answered exactly as one that does not exist.
  if (!row || row.userId !== userId) throw new HttpError(404, 'Connection not found')
  return row
}

export const renewConnection: RenewConnection<{ id: string; expiresInDays?: number }, ConnectionView> = async (args, context) => {
  const userId = requireUser(context)
  const row = await ownConnection(args.id, userId)
  if (row.revokedAt) throw new HttpError(400, 'A revoked connection cannot be renewed; create a new one')
  const now = new Date()
  // Renewing an expired connection makes another active one, so it counts against the cap as a new one does.
  if (row.expiresAt.getTime() <= now.getTime()) await requireRoomForAnother(userId, now)
  const updated = await prisma.personConnection.update({
    where: { id: row.id },
    data: { expiresAt: expiryFrom(now, args.expiresInDays) },
  })
  const [view] = await toViews([updated])
  return view
}

export const revokeConnection: RevokeConnection<{ id: string }, ConnectionView> = async (args, context) => {
  const userId = requireUser(context)
  const row = await ownConnection(args.id, userId)
  const updated = row.revokedAt
    ? row
    : await prisma.personConnection.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
  const [view] = await toViews([updated])
  return view
}
