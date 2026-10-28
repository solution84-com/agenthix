import { OrgAdminHeading, OrgAdminPage } from '../../../org/pages/OrgAdminPage'
import { BuiltInSkillsSection } from './BuiltInSkillsSection'
import { MaintainersSection } from './MaintainersSection'
import { OutsideSettings } from './OutsideSettings'
import { TrustedPublishersSection } from './TrustedPublishersSection'

/**
 * Manage organisation › Settings › Library and skills (board R2): whom the organisation trusts to sign what it
 * installs, and how skills reach agents. For administrators only; the Library itself is in everyone's sidebar.
 */
export function LibrarySettingsPage() {
  return (
    <OrgAdminPage area="settings" title="Library and skills">
      <OrgAdminHeading title="Library and skills">Whom the organisation trusts to sign what it installs, and how skills reach agents.</OrgAdminHeading>
      <TrustedPublishersSection />
      <OutsideSettings />
      <MaintainersSection />
      <BuiltInSkillsSection />
    </OrgAdminPage>
  )
}
