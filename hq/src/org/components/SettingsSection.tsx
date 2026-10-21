import { Link } from 'react-router'
import { useQuery, getOrgSettingsState } from 'wasp/client/operations'
import { CardLine, OrgCard, OrgGroupHeading } from './orgCardParts'

/** "Anthropic", "Anthropic +1 more": the first provider, then how many others. Never a runtime. */
export function modelAccessText(providers: string[]): string {
  if (providers.length === 0) return 'None set'
  return providers.length === 1 ? providers[0] : `${providers[0]} +${providers.length - 1} more`
}

/** Settings (every screen reviewed spec §3, Organisation), for admins and last: each setting's state, one card that opens Settings. */
export function SettingsSection() {
  const { data } = useQuery(getOrgSettingsState)
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  return (
    <section aria-label="Settings">
      <OrgGroupHeading title="Settings" aside={<Link to="/org/settings" className="text-accent hover:text-accent-hover">Settings ›</Link>} />
      <OrgCard title="Settings" to="/org/settings">
        {data ? (
          <>
            <CardLine left="Model access" right={modelAccessText(data.modelProviders)} />
            <CardLine left="GitHub" right={plural(data.githubAccounts, 'account')} />
            <CardLine left="Runs" right={`${data.runLimits.timeLimitMinutes} min · ${plural(data.runLimits.turnLimit, 'turn')}`} />
            <CardLine left="Tool risk rules" right={plural(data.riskRules, 'rule')} />
            <CardLine left="Automation · Voice" right={`${data.automationAllowed ? 'On' : 'Off'} · ${data.voiceOn ? 'On' : 'Off'}`} />
          </>
        ) : (
          <CardLine left="Loading…" />
        )}
      </OrgCard>
    </section>
  )
}
