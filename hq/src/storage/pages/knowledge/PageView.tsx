import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { checkPageChange, parseFrontMatter, qualifiedPageName, titleFromPageName } from '@agenthix/core'
import { OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import { mentionInMessage } from '@agenthix/ui/sessions'
import { FILES_BUTTON, FilesViewHeader, FilesQuietLine } from '@agenthix/ui/projects'
import { MarkdownMessage } from '../../../shared/components/MarkdownMessage'
import { pageEmbed, pageFolder } from './pageEmbed'
import { copyText } from '../../../shared/copyText'
import { ChangeLine } from './ChangeLine'
import { PageActions, type PageAction } from './PageActions'
import { pageLabel } from './browse'
import { useKnowledgePageContent } from './knowledgeData'
import type { KnowledgeOwner, KnowledgePageRow } from './knowledgeTypes'
import { LINK_ANCHOR, headingsOf, readableText } from './readingLinks'
import { ShowAttention } from '@agenthix/ui/attention'

export interface PageViewProps {
  owner: KnowledgeOwner
  page: string
  /** The page as the list has it, when it has it. */
  row?: KnowledgePageRow
  pages: KnowledgePageRow[]
  sections: string[]
  canChange: boolean
  backLabel: string
  onBack: () => void
  onEdit: (read: { content: string; version: string }) => void
  onOpenPage: (page: string) => void
  /** Opens a page in the organisation's Knowledge. Absent where that cannot be shown. */
  onOpenOrgPage?: (page: string) => void
  /** Opens this page's History (a tool of its own). */
  onHistory?: () => void
  /** The page is gone from where it was: moved to `to`, or deleted (`to` null). */
  onGone: (to: string | null) => void
  /** The tool is wide enough for the headings to sit beside the text. */
  wide?: boolean
}

function download(name: string, text: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  link.download = name
  link.click()
}

function scrollToHeading(root: HTMLElement | null, text: string) {
  const heading = [...(root?.querySelectorAll('h1,h2,h3') ?? [])].find(h => h.textContent?.trim() === text)
  heading?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

/** A page read (U3): what it is, who changed it, its text with its headings beside it, and what links here. */
export function PageView(props: PageViewProps) {
  const { owner, page, row, pages, canChange, backLabel, onBack, onEdit, onOpenPage, onOpenOrgPage, onHistory } = props
  const read = useKnowledgePageContent(owner, page)
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState<PageAction | null>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const content = read.data?.content
  const parsed = useMemo(() => {
    if (content === undefined) return null
    const front = parseFrontMatter(content)
    const body = front.problems.length && front.body === '' ? content : front.body
    return { body, summary: checkPageChange(page, content).summary, ...readableText(page, body) }
  }, [content, page])
  const known = useMemo(() => new Set(pages.map(p => p.page)), [pages])

  const title = row ? pageLabel(row) : parsed?.summary.title ?? titleFromPageName(page)
  const description = row?.description ?? parsed?.summary.description ?? ''
  const tags = row?.tags ?? parsed?.summary.tags ?? []
  const properties = Object.entries(row?.properties ?? parsed?.summary.properties ?? {})
  const lastChange = read.data?.lastChange ?? row?.lastChange
  const problems = row?.problems ?? []
  const reference = `knowledge/${page}`

  const mention = async () => {
    if (mentionInMessage(reference)) { setNotice(''); return }
    setNotice((await copyText(reference)) ? '' : `Mention ${reference} in your message.`)
  }
  const fileName = page.slice(page.lastIndexOf('/') + 1)
  const menu: OverflowItem[] = [
    ...(canChange ? [
      { label: 'Move…', onSelect: () => setAction('move') },
    ] : []),
    ...(content !== undefined ? [{ label: 'Download', onSelect: () => download(fileName, content) }] : []),
    ...(canChange ? [{ label: 'Delete', danger: true, onSelect: () => setAction('delete') }] : []),
  ]

  const onTextClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (!a || !href) return
    if (/^https?:/i.test(href)) return
    e.preventDefault()
    if (!href.startsWith(LINK_ANCHOR)) return
    const link = parsed?.links[Number(href.slice(LINK_ANCHOR.length))]
    if (!link) return
    if (link.page === null) setNotice(`The link to ${link.target} leads outside this place's knowledge.`)
    else if (link.level === null) {
      if (known.has(link.page)) { setNotice(''); onOpenPage(link.page) } else setNotice(`The link to ${link.target} leads to no page.`)
    } else if (link.level === 'org' && onOpenOrgPage) { setNotice(''); onOpenOrgPage(link.page) } else {
      setNotice(`${qualifiedPageName(link.level, link.page)} is in another place's knowledge: ask an agent to read it.`)
    }
  }

  const actions = (
    <>
      {canChange && (
        <button type="button" className={FILES_BUTTON} disabled={!read.data} onClick={() => read.data && onEdit(read.data)}>Edit</button>
      )}
      <button type="button" className={FILES_BUTTON} onClick={() => void mention()}>Mention</button>
      {onHistory && <button type="button" className={FILES_BUTTON} onClick={onHistory}>History</button>}
      <OverflowMenu items={menu} />
    </>
  )

  const headings = parsed ? headingsOf(parsed.body) : []
  const linkedFrom = read.data?.linkedFrom ?? []
  return (
    <>
      <FilesViewHeader back={backLabel} onBack={onBack} title={title} action={actions} />
      <div className="px-4 pt-3">
        {description && <p className="text-body text-text-secondary">{description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {tags.map(t => <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">{t}</span>)}
          {properties.filter(([, v]) => (Array.isArray(v) ? v.length : v) !== '').map(([name, value]) => (
            <span key={name} className="rounded-full border border-border-subtle px-2 py-0.5 text-micro text-text-secondary">
              <span className="text-text-muted">{name}</span> {Array.isArray(value) ? value.join(', ') : value}
            </span>
          ))}
        </div>
        {lastChange && <p className="mt-1.5 text-small text-text-muted">Changed <ChangeLine change={lastChange} linked /></p>}
        {notice && <ShowAttention text={notice} />}
        {problems.length > 0 && (
          <ul role="alert" className="mt-3 list-disc rounded-lg bg-surface-2 py-2 pl-7 pr-3 text-small text-warning">
            {problems.map((p, i) => <li key={i}>{p.message}</li>)}
          </ul>
        )}
        {action && (
          <PageActions
            owner={owner} page={page} version={read.data?.version ?? null} action={action} sections={props.sections}
            onClose={() => setAction(null)} onGone={props.onGone}
          />
        )}
      </div>
      {read.isLoading && <FilesQuietLine>Loading…</FilesQuietLine>}
      {read.error && <ShowAttention title="The page could not be read" text={read.error.message} />}
      {parsed && (
        <div className={`flex gap-4 px-4 py-4 ${props.wide ? 'flex-row-reverse' : 'flex-col'}`}>
          {headings.length > 0 && (
            <nav aria-label="On this page" className={`shrink-0 ${props.wide ? 'w-48' : ''}`}>
              <h4 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">On this page</h4>
              <ul>
                {headings.map((h, i) => (
                  <li key={i} style={{ paddingLeft: `${(h.level - 1) * 10}px` }}>
                    <button type="button" onClick={() => scrollToHeading(textRef.current, h.text)} className="py-0.5 text-left text-small text-text-secondary hover:text-text-primary">
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {/* Clicks on the rendered text are links; the handler decides which open a page. */}
          <div ref={textRef} className="min-w-0 flex-1" onClick={onTextClick}>
            <MarkdownMessage content={parsed.text} embed={pageEmbed(owner, pageFolder(page))} />
            {linkedFrom.length > 0 && (
              <section aria-label="Linked from" className="mt-6 border-t border-border-subtle pt-3">
                <h4 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Linked from</h4>
                <ul className="space-y-0.5">
                  {linkedFrom.map(p => {
                    const other = pages.find(r => r.page === p)
                    return (
                      <li key={p}>
                        <button type="button" onClick={() => onOpenPage(p)} className={`rounded text-small text-link underline underline-offset-2 ${FOCUS_RING}`}>
                          {other ? pageLabel(other) : titleFromPageName(p)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
