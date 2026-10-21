/**
 * Org and team operations — control-plane service layer (hq/site split spec
 * §7.2, plan 5b-2 task 4). See taskOps.ts's header for the shared conventions.
 */
import { prisma } from 'wasp/server'
import { ControlPlaneError, callerUserId, type CallerContext } from './types'
import { requireRoleFloor } from './authorize'
import { changeOrgPackage, prepareOrgPackage } from '../../packages/orgPackageService'
import { PackageContentError, PackageWriteConflictError } from '../../packages/packageStore'

// ── get_org ───────────────────────────────────────────────────────────────────

export async function getOrgOp(_ctx: CallerContext, _args: unknown) {
  const org = await prisma.org.findFirst()
  return {
    orgId: org?.id ?? 'local',
    name: org?.name ?? 'My Organisation',
    vision: org?.vision ?? '',
    mission: org?.mission ?? '',
    mode: 'standalone',
  }
}

// ── update_org ────────────────────────────────────────────────────────────────

export async function updateOrgOp(
  ctx: CallerContext,
  args: { name?: string; vision?: string; mission?: string },
) {
  await requireRoleFloor(ctx, 'update_org')
  const org = await prisma.org.findFirst()
  if (!org) throw new ControlPlaneError('not_found', 'No org found')
  // The Org row and the org package it feeds move together: a write
  // failure rolls the row write back too. A first-ever write's
  // disk reads are done here, before the transaction opens — reading them
  // inside prisma.$transaction risks its 5s interactive-transaction timeout
  // on sequential disk I/O.
  const initialFiles = await prepareOrgPackage()
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.org.update({
        where: { id: org.id },
        data: {
          ...(args.name !== undefined && { name: args.name }),
          ...(args.vision !== undefined && { vision: args.vision }),
          ...(args.mission !== undefined && { mission: args.mission }),
        },
      })
      await changeOrgPackage(files => files, callerUserId(ctx), tx, initialFiles ?? undefined)
      return row
    })
    return { orgId: updated.id, name: updated.name, vision: updated.vision, mission: updated.mission }
  } catch (err) {
    if (err instanceof PackageContentError) throw new ControlPlaneError('invalid', err.message)
    if (err instanceof PackageWriteConflictError) throw new ControlPlaneError('conflict', err.message)
    throw err
  }
}

// ── list_teams ────────────────────────────────────────────────────────────────

export async function listTeamsOp(_ctx: CallerContext, _args: { includeDisabled?: boolean }) {
  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, purpose: true, people: { select: { userId: true } }, agents: { select: { agentId: true } } },
  })
  return {
    teams: teams.map(t => ({
      teamId: t.id,
      name: t.name,
      purpose: t.purpose,
      agentIds: t.agents.map(a => a.agentId),
      userIds: t.people.map(p => p.userId),
    })),
    source: 'local',
  }
}

// ── create_team ───────────────────────────────────────────────────────────────

// No blanket try/catch-and-wrap here (plan 5b-2 task 5 review, I3): an
// unknown agent is refused as `invalid`; any other failure propagates
// uncaught, and dataApi.ts's generic catch turns it into an opaque 500 rather
// than forwarding err.message into a 400 body. A new team is in no project yet,
// so creating it writes no project membership (adr-0103).
export async function createTeamOp(
  ctx: CallerContext,
  args: { name: string; purpose: string; agentIds: string[] },
) {
  await requireRoleFloor(ctx, 'create_team')
  const agentIds = [...new Set(args.agentIds ?? [])]
  if (agentIds.length > 0 && (await prisma.agent.count({ where: { id: { in: agentIds } } })) !== agentIds.length) {
    throw new ControlPlaneError('invalid', 'One of those agents does not exist')
  }
  const team = await prisma.team.create({
    data: {
      name: args.name,
      purpose: args.purpose ?? '',
      createdBy: callerUserId(ctx),
      agents: { create: agentIds.map(agentId => ({ agentId })) },
    },
  })
  return { success: true, teamId: team.id, message: `Team '${args.name}' created`, source: 'local' }
}

// ── get_github_config ────────────────────────────────────────────────────────

export async function getGithubConfigOp(_ctx: CallerContext, _args: unknown) {
  const { getApp } = await import('../../github/githubApp')
  const app = await getApp()
  return app ? { configured: true, slug: app.slug } : { configured: false }
}
