/**
 * A run that stopped for lack of resources, in the words hq shows on the task and in the conversation (core's
 * `runResource.ts`, host-management spec §10). The site sends the cause and the limit it hit; only hq knows the name
 * people know the site by, so hq writes the sentence.
 */
import { prisma } from 'wasp/server'
import { parseRunResourceShortage, runResourceSentence, type RunFailedDetail, type TranscriptRow } from '@agenthix/core'
import { displaySiteName } from '../../shared/siteName'

/** The site's name as people read it; "its site" for one hq no longer has. */
export async function siteNameOf(siteId: string): Promise<string> {
  const row = await prisma.executionSite.findUnique({ where: { siteId }, select: { label: true, isDefault: true } })
  return row ? displaySiteName(row) : 'its site'
}

/** The sentence for a failed run's `resource`, or null when it carries none (or not one hq recognises). */
export function shortRunSentence(resource: unknown, siteName: string): string | null {
  const shortage = parseRunResourceShortage(resource)
  return shortage ? runResourceSentence(shortage, siteName) : null
}

function shortage(row: TranscriptRow): unknown {
  return row.kind === 'RUN_FAILED' ? (row.detail as RunFailedDetail | null)?.resource : undefined
}

/** A transcript's failed rows with a cause written again with the site's name; every other row as it came. */
export function withSiteName(rows: TranscriptRow[], siteName: string): TranscriptRow[] {
  return rows.map(row => {
    const sentence = shortRunSentence(shortage(row), siteName)
    if (!sentence) return row
    return { ...row, content: sentence, detail: { ...(row.detail as RunFailedDetail), reason: sentence } }
  })
}

/** `withSiteName`, reading the site's name only when some row needs it. */
export async function namedShortRuns(siteId: string, rows: TranscriptRow[]): Promise<TranscriptRow[]> {
  if (!Array.isArray(rows) || !rows.some(row => shortage(row) !== undefined)) return rows
  return withSiteName(rows, await siteNameOf(siteId))
}
