import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { ModelDefaults } from '../components/ModelDefaults'

/** Models in the admin area: three settings and one line about which models may run. The server refuses anyone but organisation admins. */
export function ModelsPage() {
  return (
    <AppLayout breadcrumbs={[{ label: 'Manage organisation', href: '/admin' }, { label: 'Models' }]}>
      <div className="max-w-[760px] px-4 py-9 lg:px-10">
        <h1 className="text-h1 font-medium text-text-primary">Models</h1>
        <p className="mt-0.5 text-small text-text-secondary">
          What every agent uses unless it has its own. Keys are on{' '}
          <Link to="/admin/providers" className={`rounded text-link hover:underline ${FOCUS_RING}`}>Providers</Link>.
        </p>
        <div className="mt-6"><ModelDefaults /></div>
      </div>
    </AppLayout>
  )
}
