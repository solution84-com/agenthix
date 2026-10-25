import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { FilesQuietLine, FilesToolNote } from '@agenthix/ui/projects'
import { sectionOfPage, titleFromPageName } from '@agenthix/core'
import { isSiteUnreachable } from '../../shared/siteSilence'
import { KnowledgeBrowse } from './knowledge/KnowledgeBrowse'
import { PageHistory } from './knowledge/history/PageHistory'
import { RecentlyDeleted } from './knowledge/history/RecentlyDeleted'
import { orgPageHref } from './knowledge/search/SearchResults'
import { PageEditor, type EditTarget } from './knowledge/PageEditor'
import { PageView } from './knowledge/PageView'
import type { Selection } from './knowledge/SectionTree'
import { useKnowledgePages } from './knowledge/knowledgeData'
import type { KnowledgeOwner } from './knowledge/knowledgeTypes'
import { useToolParams, useWide } from './useToolParams'

function selectionOf(url: ReturnType<typeof useToolParams>): Selection | null {
  const view = url.get('view')
  if (view === 'all' || view === 'fix' || view === 'deleted') return { view }
  const section = url.get('section')
  return section !== null || view === 'section' ? { view: 'section', section: section ?? '' } : null
}

const intro = (place: string) =>
  `What ${place} knows, in pages and sections — processes, decisions, reference. Agents look things up here when they need to, and change it when you ask. Nothing here is read on every run: that is AGENTS.md.`

function introOf(owner: KnowledgeOwner, personal?: boolean): string {
  if (owner.ownerType === 'org') {
    return `${intro('the organisation')} Every member can read it; organisation admins change it, or ask an agent to.`
  }
  return personal ? `${intro('your space')} Only you see it, and it never reaches a project unless you copy it there.` : intro('this project')
}

/**
 * The Knowledge tool (agent knowledge spec, screens U2 and U3): a place's sections beside their pages, a
 * page read or edited, and for people who may change the place, New page, New section, Move and Delete. The same tool
 * serves a project's, a person's and the organisation's knowledge; `canChange` comes with the list.
 */
export function KnowledgeTool({ owner, personal, onOpenOrgPage }: {
  owner: KnowledgeOwner
  personal?: boolean
  /** Opens a page in the organisation's Knowledge, for an `org:` link; by default, its address in the organisation's area. */
  onOpenOrgPage?: (page: string) => void
}) {
  const url = useToolParams()
  const navigate = useNavigate()
  const openOrgPage = onOpenOrgPage ?? ((target: string) => navigate(orgPageHref(target)))
  const ref = useRef<HTMLDivElement>(null)
  const wide = useWide(ref)
  const list = useKnowledgePages(owner)
  const [compose, setCompose] = useState<EditTarget | null>(null)
  /** The page just deleted, until the person goes anywhere else. */
  const [deleted, setDeleted] = useState<string | null>(null)
  const page = url.get('page')
  const selected = selectionOf(url)
  const rows = list.data?.pages ?? []
  const sections = (list.data?.sections ?? []).map(s => s.path).filter(p => p !== '')

  const open = (next: string | null) => { setDeleted(null); url.set({ page: next }) }
  const select = (s: Selection | null) => { setDeleted(null); url.set({ page: null, view: s?.view ?? null, section: s?.view === 'section' ? s.section || null : null }) }
  const changed = () => { void list.refetch?.() }
  const backLabel = selected?.view === 'section' && selected.section ? selected.section.slice(selected.section.lastIndexOf('/') + 1) : 'Knowledge'

  let content: ReactNode
  if (list.error) {
    content = (
      <FilesQuietLine role="status">
        {isSiteUnreachable(list.error) ? `The site holding these isn't answering. ${list.error.message}` : list.error.message}
      </FilesQuietLine>
    )
  } else if (!list.data) {
    content = <FilesQuietLine>Loading…</FilesQuietLine>
  } else if (compose) {
    content = (
      <PageEditor
        owner={owner} target={compose} pages={rows} backLabel={compose.kind === 'edit' ? 'Page' : backLabel}
        onCancel={() => setCompose(null)}
        onSaved={saved => { setCompose(null); changed(); url.set({ page: saved }) }}
      />
    )
  } else if (page && url.get('view') === 'history') {
    content = (
      <PageHistory
        owner={owner} page={page} canChange={list.data.canChange} initialVersionId={url.get('history') ?? undefined}
        onBack={() => url.set({ view: null, history: null })}
      />
    )
  } else if (page) {
    const sectionOnReturn = sectionOfPage(page)
    content = (
      <PageView
        key={page} owner={owner} page={page} row={rows.find(r => r.page === page)} pages={rows} sections={sections}
        canChange={list.data.canChange} wide={wide}
        backLabel={sectionOnReturn ? sectionOnReturn.slice(sectionOnReturn.lastIndexOf('/') + 1) : 'Knowledge'}
        onBack={() => open(null)}
        onEdit={read => setCompose({ kind: 'edit', page, content: read.content, version: read.version })}
        onOpenPage={open} onOpenOrgPage={openOrgPage}
        onHistory={() => url.set({ view: 'history' })}
        onGone={to => {
          changed()
          if (to !== null) { open(to); return }
          // Deleted: back to its section at once, saying where it went.
          const title = rows.find(r => r.page === page)?.title || titleFromPageName(page)
          url.set({ page: null, view: 'section', section: sectionOnReturn || null })
          setDeleted(title)
        }}
      />
    )
  } else {
    content = (
      <KnowledgeBrowse
        owner={owner} personal={personal} list={list.data} wide={wide} selected={selected}
        onSelect={select} onOpenPage={open}
        onNewPage={section => setCompose({ kind: 'new', section })}
        deleted={() => <RecentlyDeleted owner={owner} canChange={list.data?.canChange ?? false} />}
      />
    )
  }

  const showNote = !page && !compose
  return (
    <div ref={ref} className="bg-surface-1">
      {showNote && (
        <FilesToolNote>
          {introOf(owner, personal)}
        </FilesToolNote>
      )}
      {deleted !== null && !page && (
        <p role="status" className="px-4 pt-3 text-small text-text-secondary">
          Deleted {deleted}. It is kept for 30 days in{' '}
          <button type="button" className="text-accent underline underline-offset-2" onClick={() => select({ view: 'deleted' })}>Recently deleted</button>.
        </p>
      )}
      {content}
    </div>
  )
}
