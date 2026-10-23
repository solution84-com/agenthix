import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'
import { WebSearchKeyBlock } from './WebSearchKeyBlock'

/**
 * Organisation › Settings › Web search: the organisation's web-search key. Model and voice providers are managed on
 * Manage organisation › Providers (models from one place, part 1).
 */
export function ModelAccessPage() {
  return (
    <OrgAdminPage area="settings" title="Web search">
      <OrgAdminHeading title="Web search">
        The key agents on OpenCode search the web with. Model and voice providers are under Manage organisation ›
        Providers.
      </OrgAdminHeading>
      <WebSearchKeyBlock />
    </OrgAdminPage>
  )
}
