import type { ReactNode } from 'react'
import { File, FileImage, Folder } from 'lucide-react'
import { PanelHeaderContent, ViewHeaderRow } from '../primitives/ViewHeaderSlot'
import { kindLabel } from './fileListing'

export const FILES_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-surface-1'

export const FILES_BUTTON_PRIMARY =
  'inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-small font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40'

/** The one header row of a view inside a Files tool: "‹ Files", the view's name, and an action at the right. */
export function FilesViewHeader({ back, onBack, title, action }: { back?: string; onBack?: () => void; title?: string; action?: ReactNode }) {
  return (
    <ViewHeaderRow>
      <PanelHeaderContent back={back} onBack={onBack} title={title} action={action} />
    </ViewHeaderRow>
  )
}

/** The line under a tool's header that says what the tool is. */
export function FilesToolNote({ children }: { children: ReactNode }) {
  return <p className="px-4 pt-3 text-small text-text-secondary">{children}</p>
}

/** A one-line fact the tool states quietly: a site that did not answer, an empty list. */
export function FilesQuietLine({ children, role }: { children: ReactNode; role?: 'status' }) {
  return <p role={role} className="px-4 py-3 text-small text-text-muted">{children}</p>
}

export function FilesGroupHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h4 className="flex items-center gap-2 px-4 pb-1 pt-4 text-micro font-medium uppercase tracking-wide text-text-muted">
      {children}
      {count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-text-secondary">{count}</span>}
    </h4>
  )
}

function EntryIcon({ name, isDir }: { name: string; isDir?: boolean }) {
  const Icon = isDir ? Folder : kindLabel(name) === 'Image' ? FileImage : File
  return <Icon size={15} aria-hidden className="shrink-0 text-text-muted" />
}

export interface FileRowProps {
  name: string
  isDir?: boolean
  /** "Markdown · 2 KB" */
  meta: string
  /** "10:25", "Mon" */
  when: string
  selected?: boolean
  onOpen: () => void
}

/** One document in a list: its name and when it changed, then its kind and size. */
export function FileRow({ name, isDir, meta, when, selected, onOpen }: FileRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full items-start gap-2.5 border-b border-border-subtle px-4 py-2.5 text-left hover:bg-surface-hover ${selected ? 'bg-surface-2' : ''}`}
    >
      <span className="mt-0.5"><EntryIcon name={name} isDir={isDir} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-text-primary">{name}</span>
        <span className="block truncate text-small text-text-muted">{meta}</span>
      </span>
      <span className="shrink-0 pt-0.5 text-small text-text-muted">{when}</span>
    </button>
  )
}

export interface TopicRowProps {
  title: string
  summary: string
  tags: string[]
  when: string
  onOpen: () => void
}

/** One topic of Knowledge: its title and when it changed, a one-line summary, and its tags. */
export function TopicRow({ title, summary, tags, when, onOpen }: TopicRowProps) {
  return (
    <button type="button" onClick={onOpen} className="block w-full border-b border-border-subtle px-4 py-2.5 text-left hover:bg-surface-hover">
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-body font-medium text-text-primary">{title}</span>
        <span className="shrink-0 text-small text-text-muted">{when}</span>
      </span>
      <span className="mt-0.5 block text-small text-text-secondary">{summary}</span>
      {tags.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1">
          {tags.map(t => <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">{t}</span>)}
        </span>
      )}
    </button>
  )
}

export interface WorkspaceCardProps {
  name: string
  /** "acme/web", or null for a workspace with no repository. */
  repository: string | null
  site: string | null
  /** Opens the workspace. */
  onOpen: () => void
  /** The card's one action, e.g. "Connect GitHub". */
  action?: ReactNode
  /** Whether a preview of it is running. */
  previewRunning?: boolean
}

/** One codebase: its name, its repository and its site, with what a person may do next. */
export function WorkspaceCard({ name, repository, site, onOpen, action, previewRunning }: WorkspaceCardProps) {
  return (
    // The whole tile opens the workspace; the name stays the button a keyboard or screen reader uses.
    <div onClick={onOpen} className="mx-4 mb-2 cursor-pointer rounded-xl border border-border-subtle bg-surface-1 p-3 transition-colors hover:border-accent">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={e => { e.stopPropagation(); onOpen() }} className="min-w-0 truncate text-left text-body font-semibold text-text-primary">{name}</button>
        {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small text-text-muted">
        <span className="font-mono">{repository ?? 'No repository'}</span>
        {previewRunning && <span className="inline-flex items-center gap-1 text-text-secondary"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />Preview running</span>}
        {site && <span>{site}</span>}
      </div>
    </div>
  )
}

/** A labelled fact of a workspace, beside or under its files. */
export function FileFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border-subtle py-2 text-small">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 text-text-primary">{children}</dd>
    </div>
  )
}
