import { type GetMyRuns, type GetMyRunsGoingCount, type GetRunsPage, type GetRunDetail, type GetToolCallOutput, type GetRunHistory, type GetRunPage } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { countMyRunsGoing, listMyRuns } from './myRuns'
import type { MyRun } from './myRunTypes'
import { readRunsPage } from './screenPage'
import { readRunDetail, readToolCallOutput, type ToolCallOutput } from './screenRun'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import type { RunDetail, RunsPageArgs, RunsPageResult } from './screenTypes'
import type { GetRunDetailArgs, GetToolCallOutputArgs } from '@agenthix/core'
import { readRunHistory } from './historyRead'
import { readRunPage } from './runPage'
import type { RunHistoryArgs, RunHistoryResult } from './historyTypes'
import type { GetRunPageArgs, RunPageView } from './runPageTypes'

export type { MyRun }

/**
 * The runs a person started or that are done on their behalf (adr-0089,
 * adr-0095), and their own conversations' runs, in the places they can see:
 * waiting for them, going now, queued, and finished recently. Each carries who
 * started it and on whose behalf, so the panel's filters ("Started by me", "On
 * my behalf") need no further read.
 */
export const getMyRuns: GetMyRuns<void, MyRun[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return listMyRuns(context.user.id)
}

/** How many of the person's runs are going now: the count on the Runs button. */
export const getMyRunsGoingCount: GetMyRunsGoingCount<void, number> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return countMyRunsGoing(context.user.id)
}

/** The Runs screen's list: the person's runs newest first, 25 at a time (screenPage.ts). */
export const getRunsPage: GetRunsPage<RunsPageArgs | undefined, RunsPageResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return readRunsPage(context.user.id, args ?? {})
}

function requireRunNamed(args: GetRunDetailArgs | undefined): void {
  if (typeof args?.runId !== 'string' || args.runId === '' || typeof args.sessionId !== 'string' || args.sessionId === '') {
    throw new HttpError(400, 'Name the run and its session')
  }
}

/** One run opened in full; null for a run that does not exist or that the person may not see — the same answer. */
export const getRunDetail: GetRunDetail<GetRunDetailArgs, RunDetail | null> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  requireRunNamed(args)
  try {
    return await readRunDetail(context.user.id, args)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

/** What one tool call of a run printed, found by the call's own id. */
export const getToolCallOutput: GetToolCallOutput<GetToolCallOutputArgs, ToolCallOutput | null> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  requireRunNamed(args)
  if (typeof args.toolUseId !== 'string' || args.toolUseId === '') throw new HttpError(400, 'Name the call')
  try {
    return await readToolCallOutput(context.user.id, args)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

/**
 * The Runs history (spec D19, RU5): a project's every run, for anyone who can see the project, or the person's own
 * runs across every project and their own space, under the filters, twenty at a time.
 */
export const getRunHistory: GetRunHistory<RunHistoryArgs | undefined, RunHistoryResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  try {
    return await readRunHistory(context.user.id, args)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

/** A run's own page (RN1); null for a run that does not exist or that the person may not see — the same answer. */
export const getRunPage: GetRunPage<GetRunPageArgs, RunPageView | null> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.runId !== 'string' || args.runId === '' || args.runId.length > 64) throw new HttpError(400, 'Name the run')
  const sessionId = typeof args.sessionId === 'string' && args.sessionId !== '' && args.sessionId.length <= 64 ? args.sessionId : undefined
  try {
    return await readRunPage(context.user.id, { runId: args.runId, sessionId })
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}
