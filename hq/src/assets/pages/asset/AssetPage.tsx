import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAction, useQuery, getAssetPage, switchToOriginalAsset } from 'wasp/client/operations'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { MoreMenu, type MenuItem } from '../../../org/components/menus'
import { AddAgentDialog } from '../../../library/components/AddAgentDialog'
import { useLibraryTransfer } from '../../../library/components/useLibraryTransfer'
import { LIBRARY_PATH, libraryUseTeamPath } from '../../../library/components/libraryRoutes'
import { AssetFiles } from '../../components/AssetFiles'
import { useAttention } from '../../../shared/components/AttentionDialog'
import { Section, SMALL_BUTTON } from '../../components/Section'
import { messageOf } from '../../components/messageOf'
import { RemoveDialog } from './dialogs/RemoveDialog'
import { AboutSection } from './sections/AboutSection'
import { TemplateSection } from './sections/TemplateSection'
import { UpdateCard } from './sections/UpdateCard'
import { VersionsSection } from './sections/VersionsSection'
import { WhoCanEdit } from './sections/WhoCanEdit'
import { SkillPage } from './skill/SkillPage'
import type { AssetPageView } from './pageTypes'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'

const KIND_WORD = { skill: 'Skills', agent: 'Agents', board: 'Boards', team: 'Teams' } as const

/**
 * An asset's page (skills spec part 6; board U3). A skill's is its files (`skill/SkillPage`). A template's is this one:
 * its content, its versions with *Return to this version*, what it carries and what was made from it, who can edit,
 * and where it came from and who signed it.
 */
export function AssetPage() {
  const { assetId = '' } = useParams()
  const navigate = useNavigate()
  const { data: page, error, refetch } = useQuery(getAssetPage, { assetId }, { retry: retryUnlessDenied })
  const back = useAction(switchToOriginalAsset)
  const transfer = useLibraryTransfer()
  const [revision, setRevision] = useState(0)
  const attention = useAttention()
  const [removing, setRemoving] = useState(false)
  const [creating, setCreating] = useState(false)

  // What was done shows on the page itself (the version in use, the agent added), so it is not said again.
  const changed = () => { setRevision(r => r + 1); void refetch() }

  if (error) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }, { label: 'Not found' }]} title="Library">
        <div className="mx-auto max-w-3xl px-4 py-5 lg:px-8"><p role="alert" className="text-body text-danger">{error.message}</p></div>
      </AppLayout>
    )
  }
  if (!page) {
    return <AppLayout breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }]} title="Library"><p className="px-4 py-5 text-body text-text-muted lg:px-8">Loading…</p></AppLayout>
  }

  const switchBack = (): void => {
    void back({ assetId: page.setAsideFor!.assetId }).then(changed, err => attention.show({ title: 'It could not be used again', text: messageOf(err), retry: switchBack }))
  }

  if (page.kind === 'skill') return <SkillPage key={page.assetId} page={page} onChanged={changed} />
  const menu: MenuItem[] = [
    ...(page.builtIn ? [] : [{ label: 'Export', hint: 'Save it as a package', onSelect: () => void transfer.exportOne(page.kind, page.assetId) }]),
    ...(!page.builtIn ? [{ label: 'Remove…', hint: 'Takes it out of the Library', danger: true, disabled: !page.can.remove, separatorBefore: true, onSelect: () => setRemoving(true) }] : []),
  ]
  const identityLine = [page.identity, page.version ? `version ${page.version}` : null, page.signedBy].filter(Boolean).join(' · ')

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Library', href: LIBRARY_PATH }, { label: KIND_WORD[page.kind], href: `${LIBRARY_PATH}?type=${page.kind}` }, { label: page.title }]}
      title={page.title}
      subtitle={identityLine}
      action={
        <>
          {page.kind === 'team' && page.can.remove && <Link to={libraryUseTeamPath(page.assetId)} className={SMALL_BUTTON}>Use this team</Link>}
          {page.kind === 'agent' && <button type="button" className={SMALL_BUTTON} onClick={() => setCreating(true)}>Create an agent from this</button>}
          {menu.length > 0 && <MoreMenu items={menu} label={`More about ${page.title}`} />}
        </>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 lg:px-8" data-testid="asset-page">
        {page.description && <p className="text-body text-text-secondary">{page.description}</p>}
        {page.unsigned && <p className="text-small text-warning" data-testid="asset-unsigned">Unsigned: nobody vouches for who made it.</p>}
        {page.setAsideFor && (
          <section className="rounded-xl border border-border bg-surface-1 p-4 text-body text-text-secondary" aria-label="Set aside" data-testid="asset-set-aside">
            <p>Set aside. Your copy, <Link to={`${LIBRARY_PATH}/${encodeURIComponent(page.setAsideFor.assetId)}`} className="font-medium text-accent hover:underline">{page.setAsideFor.identity}</Link>, has taken its place for the agents that had it.</p>
            {page.can.update && (
              <button type="button" className={`${SMALL_BUTTON} mt-2`} onClick={switchBack}>Use this again</button>
            )}
          </section>
        )}
        {page.update && <UpdateCard key={`u${revision}`} page={page} onChanged={changed} />}
        <Section title="Content" testId="asset-content"><AssetFiles key={`c${revision}`} assetId={page.assetId} /></Section>
        <TemplateSection page={page} />
        <VersionsSection key={`v${revision}`} page={page} onChanged={changed} />
        <WhoCanEdit page={page} />
        <AboutSection page={page} />
      </div>
      {removing && <RemoveDialog assetId={page.assetId} title={page.title} template onClose={() => setRemoving(false)} onRemoved={() => navigate(LIBRARY_PATH)} />}
      {attention.dialog}
      {transfer.dialog}
      <AddAgentDialog templateId={creating ? page.assetId : null} onClose={() => setCreating(false)} />
    </AppLayout>
  )
}

export type { AssetPageView }
