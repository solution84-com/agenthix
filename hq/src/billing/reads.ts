/**
 * What the billing screens read (part 5, UI flow 12): the profiles with their projects and this month's totals, the
 * choices a new project's form offers, and a project's own billing line.
 */
import { prisma } from 'wasp/server'
import type { BillingProfileView, CostBasis } from '@agenthix/core'
import { personById } from '../server/identity/people'
import { monthOf } from './months'
import { usageReport } from './report'

export type ProfileMonthTotal = { currency: string | null; basis: CostBasis; amountMicros: number | null }

export type BillingProfileListItem = BillingProfileView & {
  /** The shared projects it bills, by name. */
  projects: { id: string; name: string }[]
  /** This month in the organisation's time zone, a total per currency and basis. */
  thisMonth: ProfileMonthTotal[]
}

export type BillingProfiles = { month: string; timeZone: string; profiles: BillingProfileListItem[] }

export async function readBillingProfiles(now: Date = new Date()): Promise<BillingProfiles> {
  const org = await prisma.org.findFirst({ select: { timeZone: true } })
  const timeZone = org?.timeZone ?? 'UTC'
  const month = monthOf(now, timeZone)
  const [rows, report] = await Promise.all([
    prisma.billingProfile.findMany({
      orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isDefault: true, createdAt: true, archivedAt: true, projects: { select: { id: true, name: true }, orderBy: { name: 'asc' } } },
    }),
    usageReport(month, 'profile', null),
  ])
  const totals = new Map(report.rows.map(r => [r.billingProfileId, r.totals]))
  return {
    month, timeZone,
    profiles: rows.map(p => ({
      id: p.id, name: p.name, isDefault: p.isDefault, createdAt: p.createdAt.toISOString(), archivedAt: p.archivedAt?.toISOString() ?? null,
      projectCount: p.projects.length, projects: p.projects,
      thisMonth: (totals.get(p.id) ?? []).map(t => ({ currency: t.currency, basis: t.basis, amountMicros: t.amountMicros })),
    })),
  }
}

export type BillingProfileChoice = { id: string; name: string; isDefault: boolean }

/** The profiles a new project may be billed to; the form shows its field only when there are two or more. */
export async function readBillingProfileChoices(): Promise<BillingProfileChoice[]> {
  return prisma.billingProfile.findMany({
    where: { archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, isDefault: true },
  })
}

export type ProjectBilling = {
  billingProfile: { id: string; name: string; isDefault: boolean } | null
  /** The latest change, said as *Changed by Sam on 23 Oct from Fernhill*. */
  lastChange: { byName: string | null; at: string; fromName: string | null } | null
}

export async function readProjectBilling(projectId: string): Promise<ProjectBilling> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { billingProfile: { select: { id: true, name: true, isDefault: true } } } })
  const change = await prisma.projectBillingChange.findFirst({ where: { projectId }, orderBy: { changedAt: 'desc' } })
  let lastChange: ProjectBilling['lastChange'] = null
  if (change) {
    const [by, from] = await Promise.all([
      change.changedById ? personById(change.changedById) : null,
      change.fromProfileId ? prisma.billingProfile.findUnique({ where: { id: change.fromProfileId }, select: { name: true } }) : null,
    ])
    lastChange = { byName: by?.name ?? null, at: change.changedAt.toISOString(), fromName: from?.name ?? null }
  }
  // A shared project made before it had one is billed to the default, as the resolver costs it.
  const billingProfile = project?.billingProfile
    ?? await prisma.billingProfile.findFirst({ where: { isDefault: true }, select: { id: true, name: true, isDefault: true } })
  return { billingProfile, lastChange }
}
