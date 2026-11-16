/**
 * start_work (conversation layer spec, Commissioning outside the place; workers and results spec, Workers): the
 * lead's brief to the conversation's standing worker in a boundary the person and the agent share. Background by
 * kind: it admits the brief, queues it on the worker and returns at once; the result comes back as a completion.
 *
 * The boundary's three checks run as things stand at the call, and the run's authority is minted for that
 * boundary from the worker's session — never from the conversation's place. Work starts only in one of the
 * conversation's places (adr-0152). The same brief to the same boundary while one is pending is that one.
 */
import { Prisma } from '@prisma/client'
import { HttpError, prisma } from 'wasp/server'
import { placeOfBoundary } from '../../../routing/place'
import { z } from 'zod'
import { MESSAGE_MAX_CHARS } from '../../../shared/conversations/protocol'
import type { ConversationTool, SharedBoundary, ToolCallOutcome, TurnCapability } from '../../contract'
import { sealJson, sealText } from '../../sealing'
import { idempotencyKey } from '../../tools/turnTools'
import { THEN_DESCRIPTION, continuationFor } from '../continuation'
import { admitToBoundary, admittedBoundaries, placeLine, placesNamed, projectWords, unassignedInConversation } from '../boundaries'
import { describeWorkerModels } from '../../../models-settings/startWorkModels'
import { MODEL_CHOICE_MAX_CHARS, checkedModelFor } from '../../../models-settings/taskModelChoice'
import { standingWorker, workerClosedReason } from './standingWorker'
import { schedulePump } from './queue'
import type { WorkerArgs } from './runReads'
import { pickedSkillOfTurn } from '../pickedSkill'
import { workspaceForBrief } from './briefWorkspace'
import { workerWorkspaceLines } from '../../../branches/leadWorkspaces'

export const START_WORK = 'start_work'
export const TITLE_MAX_CHARS = 120

const input = z.object({
  boundary: z.string().min(1).describe('The key of the one place this work is in, from this tool\'s description.'),
  title: z.string().min(1).max(TITLE_MAX_CHARS).describe('One line naming the work as the person would ("Profile the image pipeline").'),
  brief: z.string().min(1).max(MESSAGE_MAX_CHARS).describe('Everything the work needs: what to do, what for, what to bring back. It sees nothing of this conversation.'),
  effort: z.enum(['light', 'heavy']).optional().describe('heavy for a large or difficult piece of work; light (the default) otherwise.'),
  model: z.string().max(MODEL_CHOICE_MAX_CHARS).optional().describe("Only when the person names a model: one of the values listed in this tool's description."),
  workspace: z.string().min(1).max(200).optional().describe("A workspaceId from this tool's description, for work that changes or works in that workspace. Leave out for the place's files."),
  then: z.string().max(2_000).optional().describe(THEN_DESCRIPTION),
})
type Input = z.infer<typeof input>

/** The places a description lists: where work can start, and the projects the person works in without the agent. */
export interface StartWorkPlaces {
  admitted: SharedBoundary[]
  unassigned?: SharedBoundary[]
  /** The lines listing the models the agent may name, when the person's words name one. */
  models?: string[]
  /** The lines listing the places' workspaces (`describeWorkerWorkspaces`). */
  workspaces?: string[]
}

/** The tool's description, with the places the person and the agent share and those the agent is not on. */
export function describeStartWork({ admitted, unassigned = [], models = [], workspaces = [] }: StartWorkPlaces): string {
  const line = (b: SharedBoundary) => `- ${b.key}: ${b.type === 'user' ? "the person's own space" : `the ${b.name} project`}`
  const lines = [
    'Do work yourself in the background, in one place of this conversation: reading, comparing, summarising or',
    'producing many things. It returns at once: do not wait for it. When it ends you are told what you found.',
    '',
    'Places you can start work in (pass the key as `boundary`; a project goes by its key or its name):',
    ...admitted.map(line),
  ]
  if (unassigned.length > 0) {
    lines.push(
      '',
      "Projects the person works in that you aren't assigned to, until a project admin assigns you (in the project:",
      'Members, ＋ Add, An agent). Asked for work in one, still call start_work there: it is refused with the reason,',
      'which you tell the person in this reply:',
      ...unassigned.map(line),
    )
  }
  lines.push(...workspaces, ...models)
  return lines.join('\n')
}

async function agentOf(agentId: string) {
  return prisma.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true } })
}

/** In a task's thread work on the task is always a run of it (the overview's task-thread rules, 6): run_task. */
export const IN_A_TASK_THREAD = "In a task's conversation, work is a run of the task: use run_task with the person's ask as its brief"

function asksForNoOne(capability: TurnCapability): boolean {
  return !capability.actingUserId || capability.trigger === 'REPORT' || capability.expiresAt <= Date.now()
}

async function pendingWithKey(conversationId: string, key: string): Promise<string | null> {
  const row = await prisma.operation.findUnique({ where: { conversationId_idempotencyKey: { conversationId, idempotencyKey: key } }, select: { id: true } })
  return row?.id ?? null
}

async function placeFor(personId: string, agentId: string, words: string, conversationId: string): Promise<{ boundary: SharedBoundary } | { refusal: string }> {
  const found = await placesNamed(personId, words)
  if (found.length > 1) {
    return { refusal: `more than one project is called "${projectWords(words)}": ${found.map(placeLine).join(', ')}; pass the key of the one you mean` }
  }
  const boundary = found[0]
  if (!boundary) {
    const known = (await admittedBoundaries(personId, agentId, START_WORK, conversationId)).map(placeLine).join(', ')
    return { refusal: `there is no project with the key or name "${words.trim()}"; the places you can work in are: ${known}` }
  }
  const admitted = await admitToBoundary({ personId, agentId, boundary, tool: START_WORK, conversationId })
  return admitted.ok ? { boundary } : { refusal: admitted.reason }
}

export interface StartWorkDeps {
  /** Moves the worker's queue on; not waited for by the tool. */
  moveOn: (workerSessionId: string) => void
}

export function createStartWorkTool(deps: StartWorkDeps = { moveOn: schedulePump }): ConversationTool {
  return {
    name: START_WORK,
    area: 'conversation',
    input,

    async offered(capability) {
      if (asksForNoOne(capability) || capability.home === 'TASK') return false
      return (await admittedBoundaries(capability.actingUserId as string, capability.agentId, START_WORK, capability.conversationId)).length > 0
    },

    async describe(capability) {
      const personId = capability.actingUserId ?? capability.readerUserId
      if (!personId) return describeStartWork({ admitted: [] })
      const [admitted, unassigned] = await Promise.all([
        admittedBoundaries(personId, capability.agentId, START_WORK, capability.conversationId),
        unassignedInConversation(personId, capability.agentId, capability.conversationId),
      ])
      const [models, workspaces] = await Promise.all([describeWorkerModels(capability.agentId, personId), workerWorkspaceLines(admitted)])
      return describeStartWork({ admitted, unassigned, models, workspaces })
    },

    async run(capability, raw, { signal }): Promise<ToolCallOutcome> {
      if (asksForNoOne(capability)) return { status: 'refused', reason: 'this reply acts for no one, so it cannot start work' }
      if (capability.home === 'TASK') return { status: 'refused', reason: IN_A_TASK_THREAD }
      const parsed = input.safeParse(raw)
      if (!parsed.success) {
        const problems = parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')
        return { status: 'refused', reason: `The arguments do not fit start_work: ${problems}` }
      }
      if (signal.aborted) return { status: 'refused', reason: 'The reply was stopped before the work started' }
      const personId = capability.actingUserId as string
      const args: Input = parsed.data
      const agent = await agentOf(capability.agentId)
      if (!agent) return { status: 'refused', reason: 'this agent no longer exists' }

      const place = await placeFor(personId, agent.id, args.boundary, capability.conversationId)
      if ('refusal' in place) return { status: 'refused', reason: place.refusal }
      const { boundary } = place
      const named = args.workspace ? await workspaceForBrief(personId, boundary, args.workspace) : null
      if (named && 'refusal' in named) return { status: 'refused', reason: named.refusal }
      const workspaceId = named?.workspaceId ?? null

      const key = idempotencyKey(START_WORK, { boundary: `${boundary.type}:${boundary.id}`, workspace: workspaceId ?? undefined, brief: args.brief.trim() })
      const pending = await pendingWithKey(capability.conversationId, key)
      if (pending) return { status: 'accepted', operationId: pending }

      const worker = await standingWorker({ conversationId: capability.conversationId, boundary, personId, workspaceId }, agent, args.title)
      const closed = workerClosedReason(worker, boundary.name)
      if (closed) return { status: 'refused', reason: closed }

      let model: string | null
      try {
        model = await checkedModelFor(args.model, { place: await placeOfBoundary({ type: boundary.type, id: boundary.id }), agentId: agent.id, userId: personId })
      } catch (err) {
        if (err instanceof HttpError) return { status: 'refused', reason: err.message }
        throw err
      }

      const continuation = continuationFor(capability, args.then)
      const skill = await pickedSkillOfTurn(capability.turnId)
      const workerArgs: WorkerArgs = { effort: args.effort ?? 'light', ...(model ? { model } : {}), ...(skill ? { skill } : {}) }
      let operationId: string
      try {
        const row = await prisma.operation.create({
          data: {
            conversationId: capability.conversationId,
            turnId: capability.turnId,
            kind: 'WORKER',
            mode: 'BACKGROUND',
            toolName: START_WORK,
            idempotencyKey: key,
            state: 'QUEUED',
            title: sealText(args.title.trim()),
            brief: sealText(args.brief.trim()),
            args: sealJson(workerArgs),
            boundaryType: boundary.type,
            boundaryId: boundary.id,
            authorisedById: personId,
            workerSessionId: worker.id,
            ...(continuation ? { continuation } : {}),
          },
          select: { id: true },
        })
        operationId = row.id
      } catch (err) {
        // The same brief admitted twice at once: the one that lost the race is the other.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const winner = await pendingWithKey(capability.conversationId, key)
          if (winner) return { status: 'accepted', operationId: winner }
        }
        throw err
      }
      deps.moveOn(worker.id)
      return { status: 'accepted', operationId }
    },
  }
}

export const startWorkTool = createStartWorkTool()
