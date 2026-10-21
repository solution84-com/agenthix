import { RunLimitsSection } from '../../../agents/pages/RunLimitsSection'
import { ArchiveFinishedSection } from '../../../projects/pages/ArchiveFinishedSection'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'

/** Organisation › Settings › Runs: what every run starts with, and when finished tasks are archived. */
export function RunsSettingsPage() {
  return (
    <OrgAdminPage area="settings" title="Runs">
      <OrgAdminHeading title="Runs">Where every project starts; a project may only be stricter.</OrgAdminHeading>
      <div className="space-y-8">
        <RunLimitsSection scope={{ kind: 'org' }} />
        <ArchiveFinishedSection scope={{ kind: 'org' }} />
      </div>
    </OrgAdminPage>
  )
}
