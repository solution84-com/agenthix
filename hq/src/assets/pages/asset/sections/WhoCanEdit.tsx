import { Link } from 'react-router'
import { LIBRARY_SETTINGS_PATH } from '../../../../library/components/libraryRoutes'
import { Section } from '../../../components/Section'
import type { AssetPageView } from '../pageTypes'

/** *Who can edit* (D28): administrators and the Library maintainers, who look after every asset. There are none per asset. */
export function WhoCanEdit({ page }: { page: AssetPageView }) {
  const names = page.maintainers
  return (
    <Section title="Who can edit" testId="asset-who">
      <p className="text-body text-text-secondary">
        Administrators and the Library maintainers{names.length > 0 ? `, ${names.join(' and ')}` : ''}, who look after every asset.
        {' '}They can edit, publish, accept an update and return to an earlier version. Choosing which agents have it, and removing it, stay with administrators.
      </p>
      <p className="mt-2 text-small"><Link to={LIBRARY_SETTINGS_PATH} className="text-accent hover:underline">Settings › Library and skills</Link></p>
    </Section>
  )
}
