import { useQuery, getMyPledge } from 'wasp/client/operations'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { SettingsRow } from './SettingsSection'

/**
 * Settings › Sign-in › Responsible AI Pledge: the person's own signature, when their linked Agenthix account has
 * signed. Shown to them alone; nothing at all without a signature hq knows of.
 */
export function PledgeRow() {
  const { data } = useQuery(getMyPledge)
  if (!data) return null
  const action = (
    <a href={data.badgeUrl} target="_blank" rel="noreferrer" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Your badge ↗</a>
  )
  return (
    <SettingsRow label="Responsible AI Pledge" action={action}>
      {data.version >= data.currentVersion
        ? `Signed version ${data.version}`
        : `Signed version ${data.version} · version ${data.currentVersion} is out`}
    </SettingsRow>
  )
}
