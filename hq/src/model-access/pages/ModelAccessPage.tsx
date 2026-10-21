import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { ModelAccessSection } from './ModelAccessSection'
import { WebSearchKeyBlock } from './WebSearchKeyBlock'

/** Organisation › Settings › Model access: the organisation's own model keys and Claude login. */
export function ModelAccessPage() {
  return (
    <OrgAdminPage area="settings" title="Model access">
      <OrgAdminHeading title="Model access">
        The organisation's own model keys and Claude login, used last: when neither a run's project nor the
        person it is for has one that works.
      </OrgAdminHeading>
      <div className="space-y-6">
        <p className="text-small text-text-secondary">
          A run uses the first credential that is usable for its model's provider. A run in a project uses
          the project's own, then the person it is for — their own Claude login, then their own API key —
          then the organisation's. A run in a person's own Chat uses theirs, then the organisation's. A
          person's own Claude login is not used for a task's runs in a project, which run as the project;
          their own API key is. Where one place holds both a Claude
          subscription and an Anthropic API key, the subscription is used while it is usable, and the API
          key otherwise; agents on OpenCode use API keys only.
        </p>
        <ModelAccessSection ownerType="org" ownerId="org" />
        <WebSearchKeyBlock />
      </div>
    </OrgAdminPage>
  )
}
