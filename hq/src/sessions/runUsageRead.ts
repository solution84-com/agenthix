/**
 * `run.usage` asked of every Execution Site at once — one round trip per site
 * for a whole view, never one per agent or task. Runs live on the site whose
 * storage they worked in, so an agent's or a project's usage can be split
 * across several; the rows are concatenated, and the totals built from them
 * (`agents/usageTotals.ts`) add across sites.
 *
 * `unanswered` names the sites missing from the answer, so a total that leaves
 * one out says so rather than reading as complete.
 */
import type { RunUsageParams, RunUsageRow, SiteSilence } from '@agenthix/core'
import { askEverySite } from '../sites/combinedRead'
import * as siteRuntimeStore from './siteRuntimeStore'

export type RunUsageRead = { rows: RunUsageRow[]; unanswered: SiteSilence[]; truncated: boolean }

export async function readRunUsage(params: RunUsageParams): Promise<RunUsageRead> {
  const read = await askEverySite((site) => siteRuntimeStore.runUsage(site.siteId, params))
  return {
    rows: read.answers.flatMap((answer) => answer.value.rows),
    unanswered: read.unanswered,
    truncated: read.answers.some((answer) => answer.value.truncated),
  }
}

/** The newest `lastRunAt` per key, across every site's rows. */
export function lastRunBy(rows: RunUsageRow[], keyOf: (row: RunUsageRow) => string | null): Map<string, string> {
  const last = new Map<string, string>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    const seen = last.get(key)
    if (!seen || row.lastRunAt > seen) last.set(key, row.lastRunAt)
  }
  return last
}
