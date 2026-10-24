/**
 * Proposing a version (workflows spec part 1, *A version*): read and check it (`proposalContent.ts`), then store it
 * as the workflow's next version, waiting for a person, with the plain checks' flags, summary and card rule. A
 * proposal approves nothing and runs nothing; the reviewer reads it next (`review/`), and only a person approves it
 * (`approve.ts`).
 *
 * The same content proposed again is the same version: one still waiting is answered again, and one approved or
 * declined is refused, since proposing it can't change what a person decided.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { ProposeWorkflowResult, WorkflowRunWorkspace } from '@agenthix/core'
import { resolveStorageSite } from '../storage/storageSite'
import { readWorkflowYaml, type YamlReader } from './definitionYaml'
import { executorImageForSite } from './executorImage'
import type { WorkflowPlace } from './placeAccess'
import { listPlaceSecretNames, listPlaceVariableNames } from './placeNames'
import { readProposal, type ProposalContent } from './proposalContent'
import { siteCalls, type SiteCalls } from './siteWorkflows'
import { githubCeilingFor } from './checks/ceiling'
import { runPlainChecks } from './checks'
import { contentOf } from './versionContent'
import { startReview } from './review/afterProposal'

/** Who proposed it: an agent's run, on behalf of a person (ADR-0095), or hq itself for a starter workflow. */
export type Proposer =
  | { kind: 'agent'; agentId: string; agentRunId: string; onBehalfOfUserId: string }
  | { kind: 'starter' }

export type ProposeInput = {
  place: WorkflowPlace
  /** The workspace the definition is read from; it must be the place's own. */
  workspace: WorkflowRunWorkspace
  /** The definition file's path in the workspace. */
  path: string
  proposer: Proposer
  /** For `set-github-secrets` only (spec part 4). */
  githubSecretNames?: string[]
}

export type ProposeDeps = { sites: Pick<SiteCalls, 'readFiles'>; readYaml: YamlReader }
const defaultDeps: ProposeDeps = { sites: siteCalls, readYaml: readWorkflowYaml }

export async function proposeWorkflowVersion(input: ProposeInput, deps: ProposeDeps = defaultDeps): Promise<ProposeWorkflowResult> {
  const { place, workspace } = input
  if (workspace.ownerType !== place.type || workspace.ownerId !== place.id) {
    throw new HttpError(400, 'A workflow is proposed from a workspace of its own place. Nothing was changed.')
  }
  const siteId = await resolveStorageSite({ ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.workspaceId })
  const image = await executorImageForSite(siteId)
  const reading = await readProposal(siteId, workspace, input.path, {
    sites: deps.sites,
    readYaml: deps.readYaml,
    secretNames: () => listPlaceSecretNames(place),
    variableNames: () => listPlaceVariableNames(place),
    executorImageDigest: image.digest,
  }, input.githubSecretNames ?? [])
  if (!reading.ok) throw new HttpError(422, reading.message)
  return storeVersion(place, reading.proposal, input.proposer)
}

/** Stores a checked proposal as the workflow's next version; exported for the starter workflows (spec part 4). */
export async function storeVersion(
  place: WorkflowPlace, proposal: ProposalContent, proposer: Proposer, follow: (versionId: string) => void = startReview,
): Promise<ProposeWorkflowResult> {
  const { content, hash } = proposal
  const name = content.definition.name
  const ceiling = await githubCeilingFor(place)
  // Two proposals at once can take the same next number; the unique constraint refuses one, which tries again.
  for (let attempt = 0; ; attempt++) {
    try {
      const stored = await prisma.$transaction(async (tx) => {
        const workflow = await tx.workflow.upsert({
          where: { placeType_placeId_name: { placeType: place.type, placeId: place.id, name } },
          create: { placeType: place.type, placeId: place.id, name },
          update: {},
          select: { id: true },
        })
        const same = await tx.workflowVersion.findUnique({
          where: { workflowId_hash: { workflowId: workflow.id, hash } },
          select: { number: true, state: true, checkFlags: true },
        })
        if (same) return { result: answerForSame(name, same, hash), versionId: null }
        const approved = await tx.workflowVersion.findFirst({ where: { workflowId: workflow.id, state: 'APPROVED' }, include: { files: true } })
        // The plain checks (R1) run as it is stored, against the version approved now: approving waits for them.
        const checks = runPlainChecks(content, approved ? { number: approved.number, content: contentOf(approved) } : null, ceiling)
        const last = await tx.workflowVersion.aggregate({ where: { workflowId: workflow.id }, _max: { number: true } })
        const number = (last._max.number ?? 0) + 1
        const created = await tx.workflowVersion.create({
          select: { id: true },
          data: {
            workflowId: workflow.id,
            number,
            hash,
            definition: content.definition as unknown as Prisma.InputJsonValue,
            githubSecretNames: content.githubSecretNames,
            executorImageDigest: content.executorImageDigest,
            origin: proposer.kind === 'starter' ? 'STARTER' : 'PROPOSED',
            proposedByAgentId: proposer.kind === 'agent' ? proposer.agentId : null,
            proposedByRunId: proposer.kind === 'agent' ? proposer.agentRunId : null,
            proposedForUserId: proposer.kind === 'agent' ? proposer.onBehalfOfUserId : null,
            checkFlags: checks.flags as unknown as Prisma.InputJsonValue,
            checkSummary: checks.summary,
            cardMayApprove: checks.card.mayApprove,
            files: { create: content.files.map((f) => ({ path: f.path, content: Buffer.from(f.bytes), executable: f.executable })) },
          },
        })
        return { result: { workflow: name, version: number, hash, flags: checks.flags, waitsForPerson: true as const }, versionId: created.id }
      })
      // The reviewer (R2) and the card follow on their own; neither holds up the answer or decides approval.
      if (stored.versionId) follow(stored.versionId)
      return stored.result
    } catch (err) {
      if (attempt < 2 && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue
      throw err
    }
  }
}

function answerForSame(
  name: string, same: { number: number; state: string; checkFlags: Prisma.JsonValue }, hash: string,
): ProposeWorkflowResult {
  if (same.state === 'APPROVED') {
    throw new HttpError(409, `This is version ${same.number} of ${name}, which is already approved and can be run. Nothing was changed.`)
  }
  if (same.state === 'DECLINED') {
    throw new HttpError(409, `This is version ${same.number} of ${name}, which a person declined. Change it before proposing again. Nothing was changed.`)
  }
  if (same.state === 'SUPERSEDED') {
    throw new HttpError(409, `This is version ${same.number} of ${name}, which a newer approved version replaced. Nothing was changed.`)
  }
  const flags = Array.isArray(same.checkFlags) ? (same.checkFlags as ProposeWorkflowResult['flags']) : []
  return { workflow: name, version: same.number, hash, flags, waitsForPerson: true }
}
