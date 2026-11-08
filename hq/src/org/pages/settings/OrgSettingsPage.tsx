import { Link } from 'react-router'
import { useQuery, getGithubAppStatus } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'
import { OrgEntryGroup, OrgEntryRow } from '../OrgEntryRow'
import { SignInPageSetting } from './SignInPageSetting'
import { UploadedFilesSetting } from './UploadedFilesSetting'
import { TrustedPackageScopesSetting } from './TrustedPackageScopesSetting'

function githubLine(status: Awaited<ReturnType<typeof getGithubAppStatus>> | undefined): string {
  if (!status) return "Installing the GitHub App on the organisation's accounts"
  if (!status.registered) return 'The GitHub App is not registered yet — register it on this page'
  const logins = status.installations.map(i => i.login)
  return logins.length > 0 ? `Installed on ${logins.join(', ')}` : 'Registered, not installed on any account yet'
}

/**
 * Organisation › Settings: the organisation as a workplace (spec §3), for its
 * admins. HQ, its sites and storage are Organisation › Infrastructure, apart.
 */
export function OrgSettingsPage() {
  const { data: github } = useQuery(getGithubAppStatus)
  return (
    <OrgAdminPage area="settings">
      <OrgAdminHeading title="Settings">The organisation's, changed by its admins.</OrgAdminHeading>
      <SignInPageSetting />
      <UploadedFilesSetting />
      <TrustedPackageScopesSetting />
      <OrgEntryGroup title="Access to models and tools">
        <OrgEntryRow to="/admin/settings/model-access" title="Web search" line="The key agents search the web with" />
        <OrgEntryRow to="/admin/settings/github" title="GitHub" line={githubLine(github)} />
      </OrgEntryGroup>
      <OrgEntryGroup title="Where work runs">
        <OrgEntryRow to="/admin/where-work-runs" title="Where work runs" line="Each site, how it is doing, and what each run gets; your fleet admins look after them" />
        <OrgEntryRow to="/admin/sites-for-projects" title="Sites for projects" line="The Execution Sites new projects can be placed on" />
      </OrgEntryGroup>
      <OrgEntryGroup title="How work runs">
        <OrgEntryRow to="/admin/settings/automation" title="Automation" line="What agents may start for the people they work for" />
        <OrgEntryRow to="/admin/settings/runs" title="Runs" line="Run time and turn limits, and archiving finished tasks" />
        <OrgEntryRow to="/admin/settings/memory" title="Memory" line="How well recall works, and the model that reads what agents remember" />
        <OrgEntryRow to="/admin/settings/library" title="Library and skills" line="Whom the organisation trusts to sign what it installs, and how skills reach agents" />
        <OrgEntryRow to="/admin/settings/risk-rules" title="Tool risk rules" line="Patterns that label a command's risk" />
      </OrgEntryGroup>
      <OrgEntryGroup title="Features">
        <OrgEntryRow to="/admin/settings/features" title="Features" line="Try a feature in beta, or switch off one new in this release" />
      </OrgEntryGroup>
      <p className="mt-6 text-small text-text-muted">
        HQ itself, its sites and storage are under{' '}
        <Link to="/admin/infrastructure" className="text-accent hover:text-accent-hover">Manage organisation › Infrastructure</Link>, kept apart from these.
      </p>
    </OrgAdminPage>
  )
}
