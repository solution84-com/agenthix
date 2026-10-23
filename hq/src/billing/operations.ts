/**
 * Billing's operations (part 5): billing profiles and the usage report are organisation admins'; a project's billing
 * line is readable by its members; the new project form's choices by anyone who may make a project.
 */
import { HttpError } from 'wasp/server'
import type {
  ArchiveBillingProfile, CreateBillingProfile, GetBillingProfileChoices, GetBillingProfiles, GetProjectBilling, GetUsageReport,
  MakeDefaultBillingProfile, RenameBillingProfile, ReportSpeechSession, SetOrganisationTimeZone, SetProjectBillingProfile,
} from 'wasp/server/operations'
import { prisma } from 'wasp/server'
import { isOrgAdmin, isProjectVisibleTo } from '../projects/membership'
import { isTimeZone } from '../setup/organisation'
import { parseMonth } from './months'
import {
  archiveBillingProfile as archive, createBillingProfile as create, makeDefaultBillingProfile as makeDefault,
  renameBillingProfile as rename, setProjectBillingProfile as setProject,
} from './profiles'
import { readBillingProfileChoices, readBillingProfiles, readProjectBilling, type BillingProfileChoice, type BillingProfiles, type ProjectBilling } from './reads'
import { recordSttSession } from './sources/voice'
import { REPORT_GROUPS, usageReport, type ReportGroup, type UsageReport } from './report'

async function requireOrgAdmin(user: { id: string } | undefined | null, what: string): Promise<string> {
  if (!user) throw new HttpError(401)
  if (!(await isOrgAdmin(user.id))) throw new HttpError(403, `Only an organisation admin ${what}.`)
  return user.id
}

export const getBillingProfiles: GetBillingProfiles<void, BillingProfiles> = async (_args, context) => {
  await requireOrgAdmin(context.user, 'sees billing profiles')
  return readBillingProfiles()
}

export const getBillingProfileChoices: GetBillingProfileChoices<void, BillingProfileChoice[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return readBillingProfileChoices()
}

export const getProjectBilling: GetProjectBilling<{ projectId: string }, ProjectBilling & { mayChange: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  if (typeof args?.projectId !== 'string' || !(await isProjectVisibleTo(args.projectId, context.user.id))) throw new HttpError(404, 'Project not found')
  return { ...(await readProjectBilling(args.projectId)), mayChange: await isOrgAdmin(context.user.id) }
}

export const createBillingProfile: CreateBillingProfile<{ name: string; projectIds?: string[] }, { id: string }> = async (args, context) => {
  const by = await requireOrgAdmin(context.user, 'makes billing profiles')
  return create({ name: args?.name, projectIds: Array.isArray(args?.projectIds) ? args.projectIds.filter((p): p is string => typeof p === 'string') : [] }, by)
}

export const renameBillingProfile: RenameBillingProfile<{ id: string; name: string }, void> = async (args, context) => {
  await requireOrgAdmin(context.user, 'renames billing profiles')
  await rename({ id: args?.id, name: args?.name })
}

export const makeDefaultBillingProfile: MakeDefaultBillingProfile<{ id: string }, void> = async (args, context) => {
  await requireOrgAdmin(context.user, 'chooses the default billing profile')
  await makeDefault({ id: args?.id })
}

export const archiveBillingProfile: ArchiveBillingProfile<{ id: string; moveProjectsTo?: string }, void> = async (args, context) => {
  const by = await requireOrgAdmin(context.user, 'archives billing profiles')
  await archive({ id: args?.id, moveProjectsTo: args?.moveProjectsTo }, by)
}

export const setProjectBillingProfile: SetProjectBillingProfile<{ projectId: string; billingProfileId: string }, void> = async (args, context) => {
  const by = await requireOrgAdmin(context.user, "changes a project's billing profile")
  await setProject({ projectId: args?.projectId, billingProfileId: args?.billingProfileId }, by)
}

export const setOrganisationTimeZone: SetOrganisationTimeZone<{ timeZone: string }, void> = async (args, context) => {
  await requireOrgAdmin(context.user, "sets the organisation's time zone")
  if (!isTimeZone(args?.timeZone)) throw new HttpError(400, 'That is not a time zone.')
  await prisma.org.updateMany({ data: { timeZone: args.timeZone } })
}

export const getUsageReport: GetUsageReport<{ month: string; groupBy?: ReportGroup; billingProfileId?: string }, UsageReport> = async (args, context) => {
  await requireOrgAdmin(context.user, 'sees usage')
  const month = parseMonth(args?.month)
  if (!month) throw new HttpError(400, 'Name a month as YYYY-MM.')
  const group = args?.groupBy ?? 'profile'
  if (!(REPORT_GROUPS as readonly string[]).includes(group)) throw new HttpError(400, 'Group by profile, project, agent or person.')
  const profile = typeof args?.billingProfileId === 'string' && args.billingProfileId ? args.billingProfileId : null
  return usageReport(month, group, profile)
}

/** A listening session ended: the client hands back the ticket its token came with, and the audio it streamed. */
export const reportSpeechSession: ReportSpeechSession<{ ticket: string; audioMs: number }, { recorded: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  if (typeof args?.ticket !== 'string' || args.ticket.length > 8192 || typeof args.audioMs !== 'number') throw new HttpError(400, 'A ticket and the audio streamed, in milliseconds.')
  return { recorded: await recordSttSession(args.ticket, context.user.id, args.audioMs) }
}
