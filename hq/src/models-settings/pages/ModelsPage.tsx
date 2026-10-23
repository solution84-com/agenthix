import { Link } from 'react-router'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { ModelDefaults } from '../components/ModelDefaults'

/** Models in the admin area: the defaults, the voice defaults and the organisation's list. The server refuses anyone but organisation admins. */
export function ModelsPage() {
  return (
    <AppLayout breadcrumbs={[{ label: 'Manage organisation', href: '/admin' }, { label: 'Models' }]}>
      <div className="max-w-[760px] px-4 py-9 lg:px-10">
        <h1 className="text-h1 font-semibold text-text-primary">Models</h1>
        <p className="mt-0.5 text-small text-text-secondary">
          Which models people and agents get, and how they are chosen. What can be reached at all is on{' '}
          <Link to="/admin/providers" className="text-accent hover:text-accent-hover">Providers</Link>.
        </p>
        <div className="mt-6"><ModelDefaults /></div>
      </div>
    </AppLayout>
  )
}
