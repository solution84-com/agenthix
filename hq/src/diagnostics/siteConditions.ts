/**
 * A site's problems become recent errors (logs and diagnostics spec, Recent
 * errors): Docker not running, a disk nearly full, not connected while work
 * waits, HQ's own site down, a site that needs upgrading. Read from the same
 * standing the Execution Sites list and its notifications use, on the same
 * pass, so the three never disagree about what is wrong.
 */
import type { SiteProblem } from '../sites/siteStanding'
import { siteProblemAdvice } from './errorAdvice'
import { recordCondition } from './recordedErrors'
import { displaySiteName } from '../shared/siteName'

export async function recordSiteProblems(site: { siteId: string; label: string; isDefault: boolean }, problems: SiteProblem[], now: Date): Promise<void> {
  for (const p of problems) {
    const advice = siteProblemAdvice(displaySiteName(site), p)
    if (!advice) continue
    await recordCondition({ origin: 'site', subject: site.siteId, advice, siteId: site.siteId, at: now })
  }
}
