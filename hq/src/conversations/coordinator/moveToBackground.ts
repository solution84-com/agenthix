/**
 * A reply that runs long carries on in the background (walkthrough findings 25, 28 and 30). After a set number of
 * steps that looked something up — steps only, never time, since the model's own pace is not the reply's length —
 * the model is called once more, and only if it asks for more tools does hq start the rest itself: its calls are not
 * run, no model call writes a brief, hq writes one from what was asked and what the reply found (backgroundBrief.ts),
 * in the conversation's own place, through start_work's own path; then a fixed reply in the agent's voice ends it.
 * A reply whose work is already done answers in that call and ends as any other, so the fixed reply never follows a
 * "done" (agent knowledge walkthrough, F6). Where it cannot start work, the next call is words only: what it has, and
 * why it stopped. The step cap stays as the guard: its last call is always words only, so a reply never ends without
 * saying anything.
 */
import type { LeadMessage, LeadRequest, LeadToolCall, LeadToolDefinition, TurnCapability } from '../contract'
import { backgroundBrief, backgroundTitle, type BriefPlace } from './backgroundBrief'
import type { StepCall } from './replySteps'

/** The tool that starts work in the background (work/workers/startWork.ts). */
export const START_WORK = 'start_work'

/** Said when the rest of a reply has moved to the background: in the agent's voice, with no model call. */
export const MOVED_TO_BACKGROUND =
  "That's taking longer than I expected — I'm working on it in the background, and I'll tell you as soon as I have it."

/** Said when a reply ended in words only and the model still said nothing. */
export const STOPPED_WITHOUT_ANSWER =
  "That took longer than I expected, and I stopped before I had an answer. Ask me again, or a narrower question, and I'll pick it up."

export type StepMode = 'free' | 'move' | 'words'

/**
 * What comes next: a model call free to use tools; one whose tool calls hq answers by moving the rest of the reply to
 * the background instead of running them (`move`); or a words-only call.
 */
export function stepMode(at: { step: number; maxSteps: number; lookups: number; moveAfter: number; canMove: boolean }): StepMode {
  if (at.step >= at.maxSteps - 1) return 'words'
  if (at.lookups >= at.moveAfter) return at.canMove ? 'move' : 'words'
  return 'free'
}

/**
 * Whether the reply may start work: start_work is offered. It is admitted per place, off only where it is set to
 * Never (work/boundaries.ts), and runs whenever it is offered — so the turn's own tool permissions, where a tool
 * they leave out reads as Ask, are not what decides it.
 */
export function canStartWork(tools: readonly LeadToolDefinition[]): boolean {
  return tools.some(t => t.name === START_WORK)
}

/** The model call's tool choice for the mode. */
export function toolChoiceFor(mode: StepMode): LeadRequest['toolChoice'] {
  return mode === 'words' ? 'none' : undefined
}

/** What the model is told when the reply must end in words now, with no way to carry on in the background. */
export function wordsNote(): LeadMessage {
  return {
    role: 'user',
    content: [
      '[This is taking too long, and it cannot carry on in the background from here. Answer now, in words only:',
      'what you have found so far, and that you stopped because it was taking too long — in the first person, and',
      'say what the person could ask next. Name anything you already changed in this reply rather than doing it',
      'again.]',
    ].join(' '),
  }
}

/** What the move reads: the person's words the reply answers, and a project's key and name. */
export interface BackgroundSources {
  /** The text of the person's messages among these, oldest first, word for word. */
  asked(inputIds: readonly string[]): Promise<string[]>
  project(projectId: string): Promise<{ key: string; name: string } | null>
}

/** The conversation's own place: the person's space, or its project. A task's thread has none to move to. */
async function placeOf(capability: TurnCapability, sources: BackgroundSources): Promise<BriefPlace | null> {
  // start_work's key for the person's own space (work/boundaries.ts).
  if (capability.home === 'PERSON') return { key: 'personal', words: "the person's own space" }
  if (capability.home !== 'PROJECT' || !capability.projectId) return null
  const project = await sources.project(capability.projectId)
  return project ? { key: project.key, words: `the ${project.name} project` } : null
}

/**
 * Starts the rest of the reply in the background, through the step's own path, so it is admitted, shown and
 * counted as work the model started would be. Whether it started: when not, the reply ends in words instead.
 */
export async function moveToBackground(input: {
  capability: TurnCapability
  inputIds: readonly string[]
  found: readonly StepCall[]
  sources: BackgroundSources
  runStep(calls: LeadToolCall[]): Promise<StepCall[]>
}): Promise<boolean> {
  const place = await placeOf(input.capability, input.sources)
  if (!place) return false
  const asked = await input.sources.asked(input.inputIds)
  const title = backgroundTitle(asked)
  if (!title) return false
  const brief = backgroundBrief({ asked, found: input.found, place })
  const call = { id: `move-${input.capability.turnId}`, name: START_WORK, input: { boundary: place.key, title, brief } }
  const [done] = await input.runStep([call])
  return done?.outcome.status === 'accepted'
}
