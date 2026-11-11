import { useQuery, getScheduledChangeNotices } from 'wasp/client/operations'
import { siteLineFact } from './noticeWords'

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * " · maintenance at 22:00" after a project's site, while a change to that site is ahead or going (decision 5 of the
 * error-message kinds): part of the site line, so the page says it while the notification tells the person. Nothing
 * when no change touches the project.
 */
export function SiteScheduleFact({ projectKey, now = new Date() }: { projectKey: string; now?: Date }) {
  const { data } = useQuery(getScheduledChangeNotices, undefined, { refetchInterval: 60_000 })
  const next = (data ?? []).find(n => n.siteName !== null && n.projectKeys.includes(projectKey))
  if (!next) return null
  return <span data-testid="site-schedule-fact"> · {siteLineFact(new Date(next.at), now, zone())}</span>
}
