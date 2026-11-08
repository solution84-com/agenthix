import { Link } from 'react-router'
import { libraryAssetPath } from '../../../../library/components/libraryRoutes'
import { Section } from '../../../components/Section'
import type { AssetPageView } from '../pageTypes'

const WHAT = { agent: 'Agents', board: 'Projects', team: 'Teams', 'task-template': 'Projects', skill: '' } as const

/** A template's page adds what it carries and what was made from it (board U3, I6, adr-0072). */
export function TemplateSection({ page }: { page: AssetPageView }) {
  const carries = page.carries ?? []
  const made = page.madeFrom ?? []
  return (
    <>
      <Section title="Skills it brings" count={carries.length} testId="asset-carries">
        {carries.length === 0 && <p className="text-small text-text-secondary">It brings no skills.</p>}
        <ul className="space-y-2">
          {carries.map(c => (
            <li key={c.identity} className="flex flex-wrap items-baseline gap-x-2 text-body">
              {c.assetId ? <Link to={libraryAssetPath(c.assetId)} className="font-medium text-text-primary hover:underline">{c.title}</Link> : <span className="font-medium text-text-primary">{c.title}</span>}
              <span className="text-small text-text-muted">{c.identity} {c.version}</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">{c.role ? 'Role' : 'Shared'}</span>
              <span className="text-small text-text-secondary">{c.state}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={`${WHAT[page.kind]} made from it`} count={made.length} testId="asset-made-from">
        {made.length === 0 ? <p className="text-small text-text-secondary">Nothing has been made from it yet.</p> : (
          <ul className="space-y-1">{made.map(m => <li key={m.name} className="text-body text-text-primary">{m.name} <span className="text-small text-text-muted">(made from {m.version})</span></li>)}</ul>
        )}
        <p className="mt-2 text-small text-text-muted">Things made from a template are their own. Updating the template doesn't change them; this only says which version each was made from.</p>
      </Section>
    </>
  )
}
