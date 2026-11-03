/**
 * The lead's offer of a live preview (live preview spec section 4, *Opening one*): when the person wants to see an app
 * running, the lead leaves a card in the conversation with *Live preview* on a code workspace, on a task's branch or on
 * `main`. The card opens nothing by itself: the person starts the live preview from it, as from the workspace view, and
 * the lead never starts an app for them to see any other way. Offered to a turn that answers a person, when the
 * conversation's project has a code workspace and live apps have an address on this install, and only while the live
 * preview's flag is on.
 */
import { z } from 'zod'
import { prisma } from 'wasp/server'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../conversations/contract'
import type { ActionBody } from '../shared/conversations/protocol'
import { appendMessage } from '../conversations/store/messages'
import { conversationEvents } from '../conversations/coordinator/events'
import { placeWorkspaces, type PlaceWorkspace } from '../branches/leadWorkspaces'
import { livePreviewsHaveAnAddress } from '../relays'
import { taskIdFor } from '../server/controlplane/taskKey'
import { livePreviewFeatureOn } from './flag'

export const OFFER_LIVE_PREVIEW_TOOL = 'offer_live_preview'
/** The card's target kind: a code workspace by id; `params` names the branch (`branchId`, `branch`), none for `main`. */
export const LIVE_PREVIEW_OFFER_TARGET = 'livePreview'

export const OFFER_LIVE_PREVIEW_DESCRIPTION =
  'Offer the person a live preview: the app of a code workspace running beside this conversation, from a task\'s ' +
  'branch or from main, for them to try. Call it when the person asks to see, open, try or run the app or site ' +
  '("show me it running", "can I try the login page?", "open the site"). Give the code workspace\'s id, and the task ' +
  'key when the work they want to see was done on a task (its branch is shown); leave the task out to show main. ' +
  'It shows a card with Live preview; nothing starts until they choose it. Do not start a server yourself for the ' +
  'person to see: an app runs in the live preview, started by the work on its branch. Offer once for a piece of work.'

const input = z.object({
  workspaceId: z.string().min(1).max(200).describe("The code workspace's id, as create_task lists it"),
  task: z.string().max(40).optional().describe('The key of the task whose branch to show, such as WEB-3; leave it out for main'),
  why: z.string().min(1).max(300).describe('One sentence the card shows, such as "See the new login page running"'),
})

export type OfferDeps = {
  codeWorkspaces(projectId: string): Promise<readonly PlaceWorkspace[]>
  /** The open branch of the project's task by its key, in that workspace; null when it has none. */
  branchOfTask(projectId: string, workspaceId: string, key: string): Promise<{ id: string; name: string } | null>
  liveAppsHaveAddress(): boolean
  /** Whether the live preview's flag is on for the organisation (adr-0172). */
  featureOn(): Promise<boolean>
  card(capability: TurnCapability, body: ActionBody): Promise<void>
}

const refused = (reason: string): ToolCallOutcome => ({ status: 'refused', reason })

async function offerable(capability: TurnCapability, deps: OfferDeps): Promise<readonly PlaceWorkspace[]> {
  if (!capability.actingUserId || !capability.projectId || capability.trigger === 'REPORT' || capability.expiresAt <= Date.now()) return []
  if (capability.permissions.neverTools.includes(OFFER_LIVE_PREVIEW_TOOL) || !deps.liveAppsHaveAddress()) return []
  if (!(await deps.featureOn())) return []
  return (await deps.codeWorkspaces(capability.projectId)).filter(w => w.git)
}

export function createOfferLivePreviewTool(deps: OfferDeps): ConversationTool {
  return {
    name: OFFER_LIVE_PREVIEW_TOOL,
    input,
    describe: async () => OFFER_LIVE_PREVIEW_DESCRIPTION,
    offered: async capability => (await offerable(capability, deps)).length > 0,
    async run(capability, raw) {
      const code = await offerable(capability, deps)
      if (code.length === 0) return refused(`${OFFER_LIVE_PREVIEW_TOOL} is not available in this reply`)
      const parsed = input.safeParse(raw ?? {})
      if (!parsed.success) return refused(`${OFFER_LIVE_PREVIEW_TOOL} got arguments it cannot use: ${parsed.error.issues.map(i => i.message).join('; ')}`)
      const ws = code.find(w => w.id === parsed.data.workspaceId.trim())
      if (!ws) return refused(`Name one of this project's code workspaces by its id: ${code.map(w => `${w.name} (${w.id})`).join(', ')}.`)
      const key = parsed.data.task?.trim() || null
      const branch = key ? await deps.branchOfTask(capability.projectId!, ws.id, key) : null
      if (key && !branch) return refused(`${key} has no branch in ${ws.name} yet: its work has not run there. Offer main instead, or wait until it has run.`)
      await deps.card(capability, {
        text: parsed.data.why.trim(), toolName: OFFER_LIVE_PREVIEW_TOOL,
        target: { kind: LIVE_PREVIEW_OFFER_TARGET, id: ws.id, label: ws.name, params: branch ? { branchId: branch.id, branch: branch.name } : {} },
      })
      return {
        status: 'done', operationId: capability.turnId,
        result: { offered: true, note: `The person sees a card with Live preview for ${branch ? branch.name : 'main'} in ${ws.name}. Nothing runs until they choose it. Do not repeat the offer.` },
      }
    },
  }
}

export const offerLivePreviewTool = createOfferLivePreviewTool({
  codeWorkspaces: projectId => placeWorkspaces('project', projectId),
  async branchOfTask(projectId, workspaceId, key) {
    const found = await taskIdFor(key)
    const task = 'taskId' in found ? await prisma.task.findFirst({ where: { id: found.taskId, projectId }, select: { id: true } }) : null
    if (!task) return null
    return prisma.workspaceBranch.findFirst({ where: { taskId: task.id, workspaceId, state: 'OPEN' }, select: { id: true, name: true } })
  },
  liveAppsHaveAddress: () => livePreviewsHaveAnAddress(),
  featureOn: livePreviewFeatureOn,
  async card(capability, body) {
    const { message } = await appendMessage({
      conversationId: capability.conversationId, role: 'PLATFORM', kind: 'ACTION', body, agentId: capability.agentId, turnId: capability.turnId,
    })
    conversationEvents.message(capability.conversationId, message)
  },
})
