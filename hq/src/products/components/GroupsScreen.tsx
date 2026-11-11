import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { useQuery, useAction, getProducts, getPrograms, getUserSettings, deleteProduct, deleteProgram } from 'wasp/client/operations'
import { Button, FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM, FOCUS_RING } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { MoreMenu } from '../../org/components/menus'
import { FileProjectDialog } from './FileProjectDialog'
import { GroupDialog } from './GroupDialog'
import { GroupProjects } from './GroupProjects'
import { WORDS, projectsText, type Group, type GroupKind } from './groupKinds'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * Products and Programs (every screen reviewed spec §3, Organisation): the list beside the one opened, which shows its
 * projects as the Projects screen's cards. On a small screen the list or the opened one, not both.
 */
export function GroupsScreen({ kind, slug }: { kind: GroupKind; slug?: string }) {
  const words = WORDS[kind]
  const navigate = useNavigate()
  const products = useQuery(getProducts, undefined, { enabled: kind === 'product' })
  const programs = useQuery(getPrograms, undefined, { enabled: kind === 'program' })
  const { data: me } = useQuery(getUserSettings)
  const removeProduct = useAction(deleteProduct)
  const removeProgram = useAction(deleteProgram)
  const [dialog, setDialog] = useState<'new' | 'edit' | 'file' | null>(null)
  const [problem, setProblem] = useState('')
  const isAdmin = me?.role === 'ADMIN'
  const groups = ((kind === 'product' ? products.data : programs.data) ?? []) as Group[]
  const opened = groups.find(g => g.slug === slug)
  const loading = (kind === 'product' ? products : programs).isLoading

  const remove = async (group: Group) => {
    if (!confirm(`Delete the ${words.one} ${group.name}? Its projects stay, unfiled.`)) return
    setProblem('')
    try {
      await (kind === 'product' ? removeProduct({ productId: group.id }) : removeProgram({ programId: group.id }))
      navigate(words.base)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : `Could not delete the ${words.one}`)
    }
  }

  const crumbs = [{ label: 'Organisation', href: '/org' }, opened ? { label: words.plural, href: words.base } : { label: words.plural }, ...(opened ? [{ label: opened.name }] : [])]
  return (
    <AppLayout breadcrumbs={crumbs}>
      <div className="grid grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-[20rem_1fr] lg:px-8">
        <div className={slug ? 'hidden lg:block' : ''}>
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-h2 font-medium text-text-primary">{words.plural}</h1>
            {isAdmin && <Button leadingIcon={<Plus size={14} />} onClick={() => setDialog('new')}>New</Button>}
          </div>
          {loading && <p className="text-small text-text-muted">Loading…</p>}
          {!loading && groups.length === 0 && <p className="text-small text-text-muted">{words.blurb}. None yet.</p>}
          <ul>
            {groups.map(g => (
              <li key={g.id} className="border-t border-border-subtle first:border-t-0">
                <Link
                  to={`${words.base}/${g.slug}`}
                  className={`flex items-center gap-3 rounded-lg px-2 py-3 ${FOCUS_RING_INSET} ${g.slug === slug ? ROW_CHOSEN : ROW_ITEM}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-body font-medium text-text-primary`}>{g.name}</div>
                    {g.description && <div className="truncate text-small text-text-muted">{g.description}</div>}
                  </div>
                  <span className="shrink-0 text-small text-text-muted">{projectsText(g._count.projects)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {kind === 'product' && <p className="mt-3 text-small text-text-muted">Programmes are the same list, with a goal: <Link to="/programs" className={`rounded text-link hover:underline ${FOCUS_RING}`}>Programmes ›</Link></p>}
        </div>

        <div className={slug ? '' : 'hidden lg:block'}>
          {slug && !opened && !loading && <p className="text-body text-text-muted">That {words.one} was not found. <Link to={words.base} className={`rounded text-link hover:underline ${FOCUS_RING}`}>Back to {words.plural}</Link></p>}
          {!slug && <p className="hidden text-body text-text-muted lg:block">Choose a {words.one} to see the projects filed under it.</p>}
          {opened && (
            <>
              <Link to={words.base} className={`rounded mb-2 inline-block text-small text-link hover:underline lg:hidden ${FOCUS_RING}`}>‹ {words.plural}</Link>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-h1 font-medium text-text-primary">{opened.name}</h2>
                  {opened.description && <p className="mt-0.5 text-body text-text-secondary">{kind === 'program' ? `Goal: ${opened.description}` : opened.description}</p>}
                  <p className="mt-0.5 text-small text-text-muted capitalize">{opened.status}</p>
                </div>
                {isAdmin && (
                  <MoreMenu items={[
                    { label: `Edit the ${words.one}`, onSelect: () => setDialog('edit') },
                    { label: `Delete the ${words.one}`, danger: true, separatorBefore: true, onSelect: () => void remove(opened) },
                  ]} />
                )}
              </div>
              <ShowAttention kind="alert" text={problem} title="The group was not deleted" onClose={() => setProblem('')} />
              <div className="my-4 flex flex-wrap items-center gap-3">
                <span className="text-small text-text-muted">{projectsText(opened._count.projects)} filed under it · {words.grouping}</span>
                <span className="grow" />
                {isAdmin && <Button variant="secondary" onClick={() => setDialog('file')}>File a project</Button>}
              </div>
              <GroupProjects kind={kind} groupId={opened.id} />
            </>
          )}
        </div>
      </div>
      <GroupDialog kind={kind} open={dialog === 'new' || dialog === 'edit'} group={dialog === 'edit' ? opened : undefined} onClose={() => setDialog(null)} onSaved={s => navigate(`${words.base}/${s}`)} />
      {opened && <FileProjectDialog kind={kind} group={opened} open={dialog === 'file'} onClose={() => setDialog(null)} />}
    </AppLayout>
  )
}
