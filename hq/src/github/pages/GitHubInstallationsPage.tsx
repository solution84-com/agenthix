import { Loader2 } from 'lucide-react'
import { useQuery, getGitHubAccounts } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { AccountsSection } from '../components/AccountsSection'
import { AppRegistration } from '../components/AppRegistration'
import { AppSection } from '../components/AppSection'

/**
 * Manage organisation › Settings › GitHub (workflows spec part 5, G1): the App and its permissions, the GitHub
 * accounts it is installed on and which projects can connect to each. Registering the App is here too.
 */
export function GitHubInstallationsPage() {
  return (
    <OrgAdminPage area="settings" title="GitHub">
      <OrgAdminHeading title="GitHub">
        The GitHub App, the GitHub accounts it is installed on, and which projects can use each.
      </OrgAdminHeading>
      <Content />
    </OrgAdminPage>
  )
}

function Content() {
  const { data, error, refetch } = useQuery(getGitHubAccounts)
  if (error) return <p role="alert" className="text-small text-danger">{(error as Error).message}</p>
  if (!data) return <div className="flex items-center gap-2 py-4 text-small text-text-muted"><Loader2 size={13} className="animate-spin" aria-hidden /> Loading…</div>
  if (!data.registered) return <AppRegistration />
  return (
    <div className="space-y-8">
      <AppSection slug={data.slug} owner={data.owner} permissions={data.appPermissions} settingsUrl={data.appSettingsUrl} onChanged={() => void refetch()} />
      <AccountsSection data={data} onChanged={() => void refetch()} />
    </div>
  )
}
