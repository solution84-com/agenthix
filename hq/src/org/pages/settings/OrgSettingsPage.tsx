import { Link } from 'react-router'
import { useQuery, getGithubAppStatus } from 'wasp/client/operations'
import { ModelPolicyForm } from '../../../model-policy/components/ModelPolicyForm'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'
import { OrgEntryGroup, OrgEntryRow } from '../OrgEntryRow'
import { SignInPageSetting } from './SignInPageSetting'
import { UploadedFilesSetting } from './UploadedFilesSetting'

function githubLine(status: Awaited<ReturnType<typeof getGithubAppStatus>> | undefined): string {
  if (!status) return "Installing the GitHub App on the organisation's accounts"
  if (!status.registered) return 'The GitHub App is not registered yet — under Infrastructure'
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
      <section className="mt-6" aria-labelledby="org-models">
        <h2 id="org-models" className="text-h3 font-semibold text-text-primary">Models</h2>
        <p className="mt-0.5 mb-4 text-small text-text-secondary">Which model talks and which does the work, for everyone who sets none of their own.</p>
        <ModelPolicyForm scope="org" canEdit />
      </section>
      <OrgEntryGroup title="Access to models and tools">
        <OrgEntryRow to="/admin/settings/model-access" title="Model access" line="The organisation's model keys and Claude login, used when a run has none of its own" />
        <OrgEntryRow to="/admin/settings/github" title="GitHub" line={githubLine(github)} />
        <OrgEntryRow to="/admin/settings/voice" title="Voice" line="Speech to text and text to speech providers" />
      </OrgEntryGroup>
      <OrgEntryGroup title="Where work runs">
        <OrgEntryRow to="/admin/where-work-runs" title="Where work runs" line="Each site, how it is doing, and what each run gets; your fleet admins look after them" />
        <OrgEntryRow to="/admin/sites-for-projects" title="Sites for projects" line="The Execution Sites new projects can be placed on" />
      </OrgEntryGroup>
      <OrgEntryGroup title="How work runs">
        <OrgEntryRow to="/admin/settings/automation" title="Automation" line="What projects' pulses and schedules may do" />
        <OrgEntryRow to="/admin/settings/runs" title="Runs" line="Run time and turn limits, and archiving finished tasks" />
        <OrgEntryRow to="/admin/settings/memory" title="Memory" line="How well recall works, and the model that reads what agents remember" />
        <OrgEntryRow to="/admin/settings/risk-rules" title="Tool risk rules" line="Patterns that label a command's risk" />
      </OrgEntryGroup>
      <p className="mt-6 text-small text-text-muted">
        HQ itself, its sites and storage are under{' '}
        <Link to="/admin/infrastructure" className="text-accent hover:text-accent-hover">Organisation › Infrastructure</Link>, kept apart from these.
      </p>
    </OrgAdminPage>
  )
}
