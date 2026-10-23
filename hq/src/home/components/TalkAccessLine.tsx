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
  return (
    <p role="status" className="text-center text-small text-text-muted" data-testid="talk-access-line">
      Agents can't answer you yet: no model is working.{' '}
      {data.isAdmin
        ? <Link to="/admin/providers" className="font-medium text-accent hover:text-accent-hover">Manage organisation › Providers</Link>
        : 'An organisation admin can set one up.'}
    </p>
  )
}
