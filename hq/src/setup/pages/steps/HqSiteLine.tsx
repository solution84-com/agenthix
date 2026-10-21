import { StateLine, TEXT_LINK } from '../../../auth/pages/parts/authUi'

/** The warning shown where HQ's own site matters and is not connected; nothing when it is. */
export function HqSiteWarning({ connected, onCheckAgain }: { connected: boolean; onCheckAgain: () => void }) {
  if (connected) return null
  return (
    <StateLine tone="warn">
      <b className="font-medium text-text-primary">HQ's site isn't connected, so Sign in with Claude won't work until it is.</b>{' '}
      <button type="button" onClick={onCheckAgain} className={TEXT_LINK}>Check again</button>
    </StateLine>
  )
}
