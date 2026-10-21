/**
 * The parameters and acknowledgements of the runtime methods (`RUNTIME_METHODS`) that `runtimeData.ts` describes in
 * words only. Split out of that file at the file-size limit; `siteMethods.ts` pairs each method with them.
 */
import type { AgentConfigPayload, SESSION_TYPES } from './runtimeData.js'
import type { RunPackages } from './packages.js'

/** The params of every method that names one row by its id (`run.get`, `session.get`, `session.archive`, …). */
export type ByIdParams = { id: string }

/** The params of every method that names one run (`toolcall.list`). */
export type ByRunIdParams = { runId: string }

/** The params of the methods that name an agent by its handle (`agent.stop`, `agent.removeDirectory`). */
export type AgentHandleParams = { handle: string }

export type SessionRenameParams = { id: string; title: string }

/** At least one field is set: the site refuses an empty selector, which would match every session. */
export type SessionDeleteManyParams = { userId?: string; taskId?: string; agentId?: string; ids?: string[] }

/** `decidedBy`: hq's id of the person who approved, when hq knows them. */
export type RunApproveParams = { runId: string; decidedBy?: string }

/** `replaced`: the request was replaced by something newer, not answered by a person. */
export type RunRejectParams = { runId: string; reason?: string; replaced?: true; decidedBy?: string }

export type AgentPromptPreviewParams = {
  agent: AgentConfigPayload
  sessionType: (typeof SESSION_TYPES)[number]
  packages: RunPackages
}

/** The plain acknowledgement of a write that has nothing to report. */
export type OkResult = { ok: true }
export type UpdatedResult = { updated: boolean }
export type DeletedResult = { deleted: boolean }
export type DeletedCountResult = { deleted: number }
export type CountResult = { count: number }
export type ApprovedResult = { approved: boolean }
export type RemovedResult = { removed: boolean }
