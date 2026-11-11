import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { BackButton, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'
import { MoreMenu, type MenuItem } from '../../org/components/menus'
import { useIsAdmin } from '../../shared/hooks/useIsAdmin'
import { Section } from '../../assets/components/Section'
import { RemoveDialog } from '../../assets/pages/asset/dialogs/RemoveDialog'
import { AboutSection } from '../../assets/pages/asset/sections/AboutSection'
import { VersionsSection } from '../../assets/pages/asset/sections/VersionsSection'
import { WhoCanEdit } from '../../assets/pages/asset/sections/WhoCanEdit'
import type { AssetPageView } from '../../assets/pages/asset/pageTypes'
import { settingsTabHref } from '../../projects/pages/settings/SettingsTabs'
import { useLibraryTransfer } from '../components/useLibraryTransfer'
import { LIBRARY_PATH } from '../components/libraryRoutes'
import { AddToProjectDialog } from '../components/AddToProjectDialog'
import { TaskTemplateHolds } from '../components/TaskTemplateHolds'

/**
 * A task template's Library page (spec D16, TM1): who made it and its version, what it holds (types with their columns
 * under the task state each sits in, fields with their options), the projects made from it, its versions, who can
 * edit, and where it came from. *Add to a project* is the page's one filled button; `?add=project` opens it at once.
 * On a phone the top bar is ‹ Back, its name and "Library · Task templates" under it, so the page's heading is drawn
 * from `lg` up only, and the facts line stays.
 */
export function TaskTemplatePage({ page, onChanged }: { page: AssetPageView; onChanged: () => void }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isAdmin = useIsAdmin()
  const transfer = useLibraryTransfer()
  const [removing, setRemoving] = useState(false)
  const adding = params.get('add') === 'project'
  const setAdding = (on: boolean) => setParams(p => { const out = new URLSearchParams(p); if (on) out.set('add', 'project'); else { out.delete('add'); out.delete('project') } return out }, { replace: true })

  const exportItem: MenuItem = { label: 'Export', hint: 'Save it as a package', disabled: !isAdmin, title: isAdmin ? undefined : 'Exporting is for administrators', onSelect: () => void transfer.exportOne('task-template', page.assetId) }
  const removeItem: MenuItem = { label: 'Remove…', hint: 'Takes it out of the Library', danger: true, disabled: !page.can.remove, separatorBefore: true, onSelect: () => setRemoving(true) }
  const menu = page.builtIn ? [] : [exportItem, removeItem]
  const identityLine = [page.identity, page.version ? `version ${page.version}` : null, page.signedBy].filter(Boolean).join(' · ')
  const made = page.madeFrom ?? []
  const listHref = `${LIBRARY_PATH}?type=task-template`
  const actions = (
    <>
      <Button leadingIcon={<Plus size={16} aria-hidden />} onClick={() => setAdding(true)}>Add to a project</Button>
      {menu.length > 0 && <MoreMenu items={menu} label={`More about ${page.title}`} />}
    </>
  )

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }, { label: 'Task templates', href: listHref }, { label: page.title }]}
      mobileHeader={
        <TopBar leading={<BackButton to={listHref} />}>
          <TopBarTitle title={page.title} under="Library · Task templates" />
        </TopBar>
      }
      phoneActions={[
        { label: 'Add to a project', onSelect: () => setAdding(true) },
        ...menu.map(m => ({ label: m.label, hint: m.hint, danger: m.danger, disabledWhy: m.disabled ? m.title ?? 'Removing is for administrators' : undefined, onSelect: m.onSelect })),
      ]}
    >
      <div data-testid="template-heading" className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border-subtle bg-surface-1 px-4 py-4 max-lg:border-b-0 max-lg:pb-0 lg:px-8">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-h1 font-medium leading-8 text-text-primary max-lg:hidden">{page.title}</h1>
          {identityLine && <p className="mt-0.5 text-body text-text-secondary max-lg:mt-0">{identityLine}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-lg:hidden">{actions}</div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8" data-testid="asset-page">
        <div className="min-w-0 space-y-4">
          {page.description && <p className="text-body text-text-secondary">{page.description}</p>}
          {page.unsigned && <p className="text-small text-warning" data-testid="asset-unsigned">Unsigned: nobody vouches for who made it.</p>}
          {page.holds && <TaskTemplateHolds holds={page.holds} />}
          <Section title="Projects made from it" count={made.length} testId="asset-made-from">
            {made.length === 0 ? <p className="text-small text-text-secondary">Nothing has been made from it yet.</p> : (
              <ul className="space-y-1">{made.map(m => <li key={m.name} className="text-body text-text-primary">{m.name} <span className="text-small text-text-muted">(made from {m.version})</span></li>)}</ul>
            )}
            <p className="mt-2 text-small text-text-muted">Things made from a template are their own. Updating the template doesn't change them; this only says which version each was made from.</p>
          </Section>
        </div>
        <div className="min-w-0 space-y-4">
          <VersionsSection page={page} onChanged={() => onChanged()} />
          <WhoCanEdit page={page} />
          <AboutSection page={page} />
        </div>
      </div>
      {adding && page.holds && (
        <AddToProjectDialog
          assetId={page.assetId} title={page.title} holds={page.holds} initialProjectId={params.get('project')}
          onClose={() => setAdding(false)}
          onAdded={key => navigate(settingsTabHref(key, 'types'))}
        />
      )}
      {removing && <RemoveDialog assetId={page.assetId} title={page.title} template onClose={() => setRemoving(false)} onRemoved={() => navigate(LIBRARY_PATH)} />}
      {transfer.dialog}
    </AppLayout>
  )
}
