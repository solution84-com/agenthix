/**
 * The usage report (part 5, R1–R3): each call's cost from the one view, `UsageCallCost`; a month cut in the
 * organisation's time zone; totals by billing profile, then by project, agent or person, each currency and each basis
 * a separate total, never added together. Names stand in for ids; an erased person reads *Former member*.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { CostBasis } from '@agenthix/core'
import { peopleByIds } from '../server/identity/people'
import { monthRange } from './months'

export const REPORT_GROUPS = ['profile', 'project', 'agent', 'person'] as const
export type ReportGroup = (typeof REPORT_GROUPS)[number]

const COLUMN: Record<Exclude<ReportGroup, 'profile'>, Prisma.Sql> = {
  project: Prisma.sql`"projectId"`,
  agent: Prisma.sql`"agentId"`,
  person: Prisma.sql`"userId"`,
}

/** One total: one currency and one basis. `amountMicros` is a safe integer of millionths; null when nothing was priced. */
export type ReportTotal = {
  currency: string | null
  basis: CostBasis
  amountMicros: number | null
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  audioMs: number
  characters: number
}

export type ReportRow = {
  billingProfileId: string
  billingProfileName: string
  /** The project, agent or person; null for the profile's own line, and for calls with none (hq's own calls). */
  key: string | null
  name: string
  totals: ReportTotal[]
}

type RawTotal = {
  billingProfileId: string; key: string | null; currency: string | null; basis: CostBasis; amount: string | null; calls: bigint
  inputTokens: bigint; outputTokens: bigint; cacheReadTokens: bigint; cacheWriteTokens: bigint; audioMs: bigint; characters: bigint
}

/** Millionths summed in `bigint`, kept exact; a total too large to be a safe integer is refused rather than rounded. */
export function wireMicros(text: string | null): number | null {
  if (text === null) return null
  const v = BigInt(text)
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('A total is too large to report')
  return Number(v)
}

export function toTotal(r: RawTotal): ReportTotal {
  return {
    currency: r.currency, basis: r.basis, amountMicros: wireMicros(r.amount), calls: Number(r.calls),
    inputTokens: Number(r.inputTokens), outputTokens: Number(r.outputTokens), cacheReadTokens: Number(r.cacheReadTokens),
    cacheWriteTokens: Number(r.cacheWriteTokens), audioMs: Number(r.audioMs), characters: Number(r.characters),
  }
}

async function rawTotals(from: Date, to: Date, group: ReportGroup, billingProfileId: string | null): Promise<RawTotal[]> {
  const key = group === 'profile' ? Prisma.sql`NULL::text` : COLUMN[group]
  const profile = billingProfileId ? Prisma.sql`AND "billingProfileId" = ${billingProfileId}` : Prisma.empty
  return prisma.$queryRaw<RawTotal[]>`
    SELECT "billingProfileId", ${key} AS "key", "currency", "basis"::text AS "basis",
      SUM("amountMicros")::text AS "amount", COUNT(*) AS "calls",
      SUM("inputTokens") AS "inputTokens", SUM("outputTokens") AS "outputTokens",
      SUM("cacheReadTokens") AS "cacheReadTokens", SUM("cacheWriteTokens") AS "cacheWriteTokens",
      SUM("audioMs") AS "audioMs", SUM("characters") AS "characters"
    FROM "UsageCallCost"
    WHERE "at" >= ${from} AND "at" < ${to} ${profile}
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2, 3, 4`
}

/** The names of the projects, agents, people and profiles a report names. */
export async function namesFor(group: ReportGroup, keys: string[], profileIds: string[]) {
  const ids = [...new Set(keys)]
  const [profiles, named] = await Promise.all([
    prisma.billingProfile.findMany({ where: { id: { in: [...new Set(profileIds)] } }, select: { id: true, name: true } }),
    group === 'project' ? prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : group === 'agent' ? prisma.agent.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : group === 'person' ? peopleByIds(ids).then(m => [...m.entries()].map(([id, p]) => ({ id, name: p.name })))
          : Promise.resolve([] as { id: string; name: string }[]),
  ])
  return { profile: new Map(profiles.map(p => [p.id, p.name])), key: new Map(named.map(n => [n.id, n.name])) }
}

const NONE_NAME: Record<ReportGroup, string> = {
  profile: '', project: 'No project', agent: 'No agent', person: 'No person',
}
const GONE_NAME: Record<ReportGroup, string> = {
  profile: '', project: 'Deleted project', agent: 'Deleted agent', person: 'Former member',
}

/** Rows for one group, one per profile and key, each with its totals. */
export function groupRows(raw: RawTotal[], group: ReportGroup, names: Awaited<ReturnType<typeof namesFor>>): ReportRow[] {
  const rows = new Map<string, ReportRow>()
  for (const r of raw) {
    const id = `${r.billingProfileId}\u0000${r.key ?? ''}`
    let row = rows.get(id)
    if (!row) {
      const profileName = names.profile.get(r.billingProfileId) ?? 'Unknown billing profile'
      const name = group === 'profile' ? profileName : r.key === null ? NONE_NAME[group] : names.key.get(r.key) ?? GONE_NAME[group]
      row = { billingProfileId: r.billingProfileId, billingProfileName: profileName, key: r.key, name, totals: [] }
      rows.set(id, row)
    }
    row.totals.push(toTotal(r))
  }
  return [...rows.values()]
}

export type UsageReport = { month: string; timeZone: string; from: string; to: string; groupBy: ReportGroup; rows: ReportRow[] }

export async function usageReport(month: string, group: ReportGroup, billingProfileId: string | null): Promise<UsageReport> {
  const org = await prisma.org.findFirst({ select: { timeZone: true } })
  const timeZone = org?.timeZone ?? 'UTC'
  const { from, to } = monthRange(month, timeZone)
  const raw = await rawTotals(from, to, group, billingProfileId)
  const names = await namesFor(group, raw.flatMap(r => (r.key ? [r.key] : [])), raw.map(r => r.billingProfileId))
  return { month, timeZone, from: from.toISOString(), to: to.toISOString(), groupBy: group, rows: groupRows(raw, group, names) }
}
