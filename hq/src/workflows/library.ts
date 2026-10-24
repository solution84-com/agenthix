/**
 * Reading a place's library: its workflows with their approved version and what waits for a person, one workflow's
 * versions, and one version with its files and its diff against the approved one. People's screens (queries.ts)
 * and the agent's `list_workflows` read from here. Nothing here holds a secret's value: a workflow names its
 * secrets, never more.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { WorkflowCheckFlag, WorkflowDefinition, WorkflowListEntry } from '@agenthix/core'
import { NEEDS_APPROVAL_AGAIN } from './imageUpgrade'
import type { WorkflowPlace } from './placeAccess'
import { diffVersions, type VersionDiff } from './versionDiff'

const definitionOf = (json: unknown) => json as WorkflowDefinition
const secretsOf = (d: WorkflowDefinition) => [...new Set(d.steps.flatMap((s) => s.secrets))].sort()

export type WaitingVersion = { number: number; hash: string; origin: string; needsApprovalAgain: string | null; createdAt: Date }

export type LibraryWorkflow = {
  id: string
  name: string
  description: string
  enabled: boolean
  approved: { number: number; hash: string; definition: WorkflowDefinition } | null
  waiting: WaitingVersion[]
}

function waitingOf(v: { number: number; hash: string; origin: string; createdAt: Date }): WaitingVersion {
  return { ...v, needsApprovalAgain: v.origin === 'IMAGE_UPGRADE' ? NEEDS_APPROVAL_AGAIN : null }
}

export async function listPlaceWorkflows(place: WorkflowPlace): Promise<LibraryWorkflow[]> {
  const rows = await prisma.workflow.findMany({
    where: { placeType: place.type, placeId: place.id },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, enabled: true,
      versions: {
        where: { state: { in: ['APPROVED', 'PROPOSED'] } },
        orderBy: { number: 'asc' },
        select: { number: true, hash: true, state: true, origin: true, definition: true, createdAt: true },
      },
    },
  })
  return rows.map((w) => {
    const approvedRow = w.versions.find((v) => v.state === 'APPROVED') ?? null
    const newest = w.versions[w.versions.length - 1]
    const shown = approvedRow ?? newest
    return {
      id: w.id,
      name: w.name,
      description: shown ? definitionOf(shown.definition).description : '',
      enabled: w.enabled,
      approved: approvedRow ? { number: approvedRow.number, hash: approvedRow.hash, definition: definitionOf(approvedRow.definition) } : null,
      waiting: w.versions.filter((v) => v.state === 'PROPOSED').map(waitingOf),
    }
  })
}

/** What `list_workflows` answers an agent for one workflow: names only. */
export function toListEntry(w: LibraryWorkflow): WorkflowListEntry {
  const d = w.approved?.definition ?? null
  return {
    name: w.name,
    description: w.description,
    enabled: w.enabled,
    approvedVersion: w.approved?.number ?? null,
    parameters: d?.parameters ?? [],
    secrets: d ? secretsOf(d) : [],
    variables: d?.variables ?? [],
    waitingVersion: w.waiting.length ? w.waiting[w.waiting.length - 1].number : null,
  }
}

export async function workflowPlace(workflowId: string): Promise<WorkflowPlace> {
  const w = await prisma.workflow.findUnique({ where: { id: workflowId }, select: { placeType: true, placeId: true } })
  if (!w) throw new HttpError(404, 'There is no such workflow.')
  return { type: w.placeType, id: w.placeId }
}

export async function readWorkflow(workflowId: string) {
  const w = await prisma.workflow.findUniqueOrThrow({
    where: { id: workflowId },
    select: {
      id: true, name: true, enabled: true, enabledChangedById: true, enabledChangedAt: true, agentRunsPerHour: true,
      placeType: true, placeId: true,
      versions: {
        orderBy: { number: 'desc' },
        select: {
          number: true, hash: true, state: true, origin: true, createdAt: true, executorImageDigest: true,
          proposedByAgentId: true, proposedByRunId: true, proposedForUserId: true, declinedById: true, declinedAt: true,
          checkSummary: true, cardMayApprove: true, reviewLevel: true, definition: true,
          approvals: { select: { approvedById: true, automatic: true, approvedAt: true } },
        },
      },
    },
  })
  return {
    ...w,
    versions: w.versions.map(({ definition, ...v }) => ({
      ...v,
      description: definitionOf(definition).description,
      needsApprovalAgain: v.state === 'PROPOSED' && v.origin === 'IMAGE_UPGRADE' ? NEEDS_APPROVAL_AGAIN : null,
    })),
  }
}

export type VersionFileView = { path: string; executable: boolean; size: number; text: string | null }

function textOf(bytes: Uint8Array): string | null {
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return t.includes('\0') ? null : t
  } catch {
    return null
  }
}

export async function readVersion(workflowId: string, number: number): Promise<{
  number: number; hash: string; state: string; origin: string; definition: WorkflowDefinition
  files: VersionFileView[]; approvedNumber: number | null; diff: VersionDiff
  checkFlags: WorkflowCheckFlag[] | null; checkSummary: string | null; cardMayApprove: boolean | null
  reviewLevel: string | null; reviewPoints: Prisma.JsonValue; needsApprovalAgain: string | null
}> {
  const version = await prisma.workflowVersion.findUnique({
    where: { workflowId_number: { workflowId, number } },
    include: { files: true },
  })
  if (!version) throw new HttpError(404, 'There is no such version of this workflow.')
  const approved = await prisma.workflowVersion.findFirst({ where: { workflowId, state: 'APPROVED' }, include: { files: true } })
  const definition = definitionOf(version.definition)
  const before = approved ? { definition: definitionOf(approved.definition), files: approved.files } : null
  return {
    number: version.number,
    hash: version.hash,
    state: version.state,
    origin: version.origin,
    definition,
    files: version.files.map((f) => ({ path: f.path, executable: f.executable, size: f.content.length, text: textOf(f.content) })),
    approvedNumber: approved?.number ?? null,
    diff: diffVersions(before, { definition, files: version.files }),
    checkFlags: Array.isArray(version.checkFlags) ? (version.checkFlags as WorkflowCheckFlag[]) : null,
    checkSummary: version.checkSummary,
    cardMayApprove: version.cardMayApprove,
    reviewLevel: version.reviewLevel,
    reviewPoints: version.reviewPoints ?? null,
    needsApprovalAgain: version.state === 'PROPOSED' && version.origin === 'IMAGE_UPGRADE' ? NEEDS_APPROVAL_AGAIN : null,
  }
}
