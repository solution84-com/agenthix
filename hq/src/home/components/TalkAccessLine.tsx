import { Link } from 'react-router'
import { useQuery, getMyModelAccess } from 'wasp/client/operations'

/**
 * Under Home's message box, for someone who cannot talk to agents yet (getting-in
 * spec, Skipped steps): one line saying so and linking to the fix. It replaces
 * the global banner; nothing shows while they can, or while it loads.
 */
export function TalkAccessLine() {
  const { data } = useQuery(getMyModelAccess)
  if (!data || data.canTalk || !data.fix) return null
  const [where, to] = data.fix === 'org-access'
    ? ["Organisation › Settings › Model access", '/org/settings/model-access']
    : ['Settings › Your model logins', '/settings']
  return (
    <p role="status" className="text-center text-small text-text-muted" data-testid="talk-access-line">
      Agents can't answer you yet: no model access is set up. <Link to={to} className="font-medium text-accent hover:text-accent-hover">{where}</Link>
    </p>
  )
}
