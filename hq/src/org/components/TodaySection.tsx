import { Link } from 'react-router'
import { useQuery, getTodayNumbers } from 'wasp/client/operations'
import { UnansweredSitesNotice, FOCUS_RING } from '@agenthix/ui/primitives'
import { unansweredSitesCopy } from '../../shared/siteSilence'
import { BigNumber, CardGrid, CardLine, OrgCard, OrgGroupHeading } from './orgCardParts'
import { useAttentionWhen } from '@agenthix/ui/attention'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** 18_200_000 -> "18.2M"; below a thousand as it is. */
export function tokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

const money = (usd: number) => (usd < 10 ? `$${usd.toFixed(2)}` : `$${Math.round(usd).toLocaleString()}`)

/** Today (every screen reviewed spec §3, Organisation), for admins, in place of the Dashboard page's numbers. */
export function TodaySection() {
  const { data: today, error, refetch } = useQuery(getTodayNumbers, undefined, { refetchInterval: 30_000 })
  const errorDialog = useAttentionWhen(error?.message, { title: "Today's numbers could not be read", retry: () => void refetch() })
  return (
    <section aria-label="Today">
      <OrgGroupHeading title="Today" aside={<Link to="/runs" className={`rounded text-link hover:underline ${FOCUS_RING}`}>Runs ›</Link>} />
      {errorDialog}
      {error ? null : (
        <>
          <CardGrid columns="lg:grid-cols-4">
            <OrgCard title="Running now">
              <BigNumber value={today?.running ?? '–'} label="running now" />
              <CardLine left={today ? `of ${today.mostAtOnce} at once, across ${plural(today.sitesReporting, 'site')}` : ''} />
            </OrgCard>
            <OrgCard title="Runs">
              <BigNumber value={today?.runsToday ?? '–'} label="runs today" />
              <CardLine left={today?.runsTodayTruncated ? 'since midnight · at least, a site cut its answer short' : 'since midnight'} />
            </OrgCard>
            <OrgCard title="Tasks">
              <BigNumber value={today?.tasksDoneThisWeek ?? '–'} label="tasks done this week" />
              <CardLine left={today ? `${today.openTasks} open in ${plural(today.projectsWithOpenTasks, 'project')}` : ''} />
            </OrgCard>
            <OrgCard title="Spend">
              <BigNumber value={today ? money(today.spendThisMonth.costUsd) : '–'} label="this month" />
              <CardLine
                left={today ? `${today.spendTruncated ? 'at least · ' : ''}estimated · ${tokenCount(today.spendThisMonth.totalTokens)} tokens` : ''}
                right={today && today.spendThisMonth.unpricedTokens > 0 ? `${tokenCount(today.spendThisMonth.unpricedTokens)} unpriced` : undefined}
              />
            </OrgCard>
          </CardGrid>
          {today && <UnansweredSitesNotice className="mt-3" copy={unansweredSitesCopy(today.unanswered, "these numbers")} />}
        </>
      )}
    </section>
  )
}
