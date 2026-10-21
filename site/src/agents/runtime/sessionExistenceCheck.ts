/**
 * The pre-launch check (person-scoped execution spec §4, adr-0076): a closed
 * conversation never runs again, and a conversation being resumed runs only
 * when its runtime says the harness still holds its state. When it does not,
 * the conversation is closed here — visibly, never restarted — and the run
 * fails with a message the person can read.
 *
 * Runtime-neutral: each runtime answers "does this session still exist?" from
 * its own state, and this acts on the answer the same way whichever runtime
 * gave it. Where the home and the working directory are is the launch's
 * business; they arrive as inputs.
 */
import type { SessionClosedReasonValue } from '@agenthix/core'
import { closeSession } from '../../server/runtime/sessionRows'
import type { AgentRuntime } from './types'

const CLOSED_MESSAGES: Record<SessionClosedReasonValue, string> = {
  HARNESS_STATE_MISSING:
    "The agent no longer has this conversation's context, so it cannot continue it. " +
    'Start a new conversation to keep working with this agent.',
  LEFT_PROJECT: 'This conversation was closed because you are no longer a member of its project.',
  LEFT_ORGANISATION: 'This conversation was closed because you are no longer a member of the organisation.',
  PROJECT_DELETED: 'This conversation was closed because its project was deleted.',
}

/**
 * A run refused because its conversation is closed. `failRun` sends the
 * closed status on the run's terminal frame, so hq's copy closes too.
 */
export class ConversationClosedError extends Error {
  constructor(readonly closedReason: SessionClosedReasonValue) {
    super(CLOSED_MESSAGES[closedReason])
    this.name = 'ConversationClosedError'
  }
}

export interface ResumableSessionCheck {
  session: { id: string; status: string; closedReason: SessionClosedReasonValue | null }
  /** Nothing of this conversation has run yet, so there is nothing to resume. */
  isNewSession: boolean
  /** The runner's harness home, as this server process sees it. */
  harnessHomeDir: string
  /** The run's working directory as the harness sees it. */
  workingDirectory: string
  /** The run's container, when it has one. */
  containerName?: string | null
}

export async function requireResumableSession(runtime: AgentRuntime, check: ResumableSessionCheck): Promise<void> {
  const { session } = check
  if (session.status === 'CLOSED' || session.closedReason) {
    throw new ConversationClosedError(session.closedReason ?? 'HARNESS_STATE_MISSING')
  }
  if (check.isNewSession) return

  const exists = await runtime.sessionExists({
    sessionId: session.id,
    harnessHomeDir: check.harnessHomeDir,
    workingDirectory: check.workingDirectory,
    containerName: check.containerName ?? null,
  })
  if (exists) return

  await closeSession(session.id, 'HARNESS_STATE_MISSING')
  throw new ConversationClosedError('HARNESS_STATE_MISSING')
}
