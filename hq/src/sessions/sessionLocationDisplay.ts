/**
 * Session working-context display (ADR-0039)
 * ==========================================
 * Turns a session's primary location (the row's owner / workspace / task, ADR-0039 §8/§10)
 * into a human label + a nav href, so the chat screen can show *where the agent is working*.
 * Pure display — the authoritative cwd resolution lives in primaryLocationService.
 *
 * It reaches no disk, so a wrong answer here grants nothing. It is still the
 * sentence an operator reads to decide whether an agent is in their files, so
 * it must make exactly the distinctions `resolvePrimaryLocation` makes, in the
 * same order.
 */
import { prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@prisma/client'
import { getWorkspace, SiteUnreachableError } from '../storage/workspaceStore'

export interface SessionLocationDisplay {
  ownerType: WorkspaceOwnerType
  ownerName: string
  /** Short human label for the context badge, e.g. "Website Redesign · Files". */
  label: string
  kind: 'files' | 'workspace' | 'task'
  /** App route to the owning surface, or null (personal/user home has no page). */
  href: string | null
}

interface SessionLocationInput {
  primaryOwnerType: WorkspaceOwnerType | null
  primaryOwnerId: string | null
  primaryWorkspaceId: string | null
  taskId?: string | null
}

export async function resolveSessionLocationDisplay(s: SessionLocationInput): Promise<SessionLocationDisplay> {
  if (!s.primaryOwnerType || !s.primaryOwnerId) {
    // No bound owner → a general chat works in the user's personal files (§8 fallback).
    return { ownerType: 'user', ownerName: 'Personal', label: 'Personal files', kind: 'files', href: null }
  }

  const ownerType = s.primaryOwnerType
  let ownerName: string = ownerType
  let ownerHref: string | null = null

  if (ownerType === 'project') {
    const p = await prisma.project.findUnique({ where: { id: s.primaryOwnerId }, select: { name: true, key: true } })
    ownerName = p?.name ?? 'Project'
    ownerHref = p ? `/projects/${p.key}` : null

    // Task-scoped session (§10): cwd is tasks/{taskId}; label it with the task key.
    if (s.taskId) {
      const t = await prisma.task.findUnique({
        where: { id: s.taskId },
        select: { number: true, project: { select: { key: true } } },
      })
      const taskKey = t ? `${t.project.key}-${t.number}` : 'task'
      return { ownerType, ownerName, label: `${ownerName} · Task ${taskKey}`, kind: 'task', href: ownerHref }
    }
  } else {
    ownerName = 'Personal'
  }

  // Workspace-scoped session ("start session here" on a workspace).
  if (s.primaryWorkspaceId) {
    // Pure display — degrade the LABEL only on an unreachable site rather than
    // 500ing an entire session list over one workspace's name being unknowable
    // right now; the authoritative cwd resolution (primaryLocationService) is
    // what actually fails closed.
    let workspaceName = 'workspace'
    try {
      const w = await getWorkspace(s.primaryWorkspaceId)
      workspaceName = w?.name ?? 'workspace'
    } catch (err) {
      if (err instanceof SiteUnreachableError) workspaceName = 'workspace unavailable'
      else throw err
    }
    return {
      ownerType,
      ownerName,
      label: `${ownerName} · ${workspaceName}`,
      kind: 'workspace',
      // The workspace's own address, in its place and open in the Workspaces tool.
      href: `${ownerHref ?? '/chat'}?tool=workspaces&workspace=${s.primaryWorkspaceId}`,
    }
  }

  // Files home (the owner's knowledge home).
  return { ownerType, ownerName, label: `${ownerName} · Files`, kind: 'files', href: ownerHref }
}
