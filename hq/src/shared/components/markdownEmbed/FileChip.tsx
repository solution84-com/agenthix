/**
 * A file named inline (spec part 3, *Chips in conversations*; board T2): icon, name and kind. A chip asks after its
 * file's facts once it comes into view — never opening it, so nothing is signed or recorded — so a file that's gone is
 * struck through with its name kept, and one changed since the message it is in says so. A stable link to another place is a chip that goes there.
 */
import type { ReactNode } from 'react'
import { File, FileCode, FileImage, FileJson, FileSpreadsheet, FileText, Folder, SquareCheck, type LucideIcon } from 'lucide-react'
import { chooseFileKind, type FileFacts, type FileKind, type SiteFileRef } from '@agenthix/core'
import { fileKindLabel } from '@agenthix/ui/files'
import type { MarkdownEmbedContext } from './embedTarget'
import type { FileFactsAnswer } from '../../../files/fileFactsAnswer'
import { useChipFacts } from './useChipFacts'

const KIND_ICON: Record<FileKind, LucideIcon> = {
  markdown: FileText, text: FileText, pdf: FileText, code: FileCode, json: FileJson, csv: FileSpreadsheet,
  image: FileImage, none: File,
}

export const CHANGED_SINCE_WORDS = 'Changed since this message'

export const CHIP = 'inline-flex max-w-full items-center gap-1 rounded-md bg-chip px-1.5 py-0.5 align-baseline text-text-primary'
const CHIP_QUIET = 'inline-flex max-w-full items-center gap-1 rounded-md bg-chip px-1.5 py-0.5 align-baseline text-text-muted'

export function nameOfRef(ref: SiteFileRef): string {
  const path = ref.space === 'artefact' ? ref.name : ref.path
  return path.split('/').pop() || path
}

/** The modified time a file's version carries (`fileVersion`: `<size>:<ms>`), or null when it carries none. */
export function modifiedMs(version: string): number | null {
  const ms = Number(version.split(':')[1])
  return Number.isFinite(ms) ? ms : null
}

/** Whether a file, as it is now, was changed after `writtenAt`. Files keep no history, so a message shows them as they are. */
export function changedSince(facts: FileFacts | undefined, writtenAt: string | undefined): boolean {
  if (!facts || !writtenAt) return false
  const modified = modifiedMs(facts.version)
  const written = Date.parse(writtenAt)
  return modified !== null && Number.isFinite(written) && modified > written
}

export function ChangedSince() {
  return <span className="ml-1 align-baseline text-micro text-text-muted">{CHANGED_SINCE_WORDS}</span>
}

export function chipFacts(name: string, known: FileFacts | undefined) {
  const facts = known ?? { name, ...chooseFileKind(name, true) }
  return { Icon: KIND_ICON[facts.kind], kind: fileKindLabel(facts) }
}

/** The words a chip's link was written with, when they are plain text. */
function textOf(label: ReactNode): string | null {
  if (typeof label === 'string' || typeof label === 'number') return String(label)
  if (Array.isArray(label) && label.every(p => typeof p === 'string' || typeof p === 'number')) return label.join('')
  return null
}

/** A link written as its kind ("[PDF](report.pdf)") says it once: the kind is not repeated after it (M9). */
export function sameAsKind(label: ReactNode, kind: string): boolean {
  return textOf(label)?.trim().toLowerCase() === kind.toLowerCase()
}

export function ChipInner({ Icon, label, kind }: { Icon: LucideIcon; label: ReactNode; kind: string }) {
  return <>
    <Icon size={13} aria-hidden className="shrink-0" />
    <span className="min-w-0 truncate">{label}</span>
    {!sameAsKind(label, kind) && <>{' '}<span className="shrink-0 text-micro text-text-muted">{kind}</span></>}
  </>
}

/** What a chip whose file isn't there says in place of its kind, so it is seen, not only heard (S20). */
export const CHIP_GONE_WORDS = 'Not here any more'
export const CHIP_NOT_FOUND_WORDS = "Can't be found"


/** Where a folder chip goes: the place's Files tool at that folder, or the workspace; null with no place to go to. */
export function folderHref(ref: SiteFileRef, placePath: string | undefined): string | null {
  if (!placePath || ref.space !== 'place' || ref.loc.taskId) return null
  const params = new URLSearchParams(ref.loc.workspaceId ? { tool: 'workspaces', workspace: ref.loc.workspaceId } : { tool: 'files', dir: ref.path })
  return `${placePath}?${params.toString()}`
}

/** A folder named inline: its name and a folder icon; a click opens it in the place's Files tool. Nothing is opened or signed. */
function FolderChip({ fileRef, children, context }: { fileRef: SiteFileRef; children: ReactNode; context: MarkdownEmbedContext }) {
  const href = folderHref(fileRef, context.placePath)
  const inner = <ChipInner Icon={Folder} label={children} kind="Folder" />
  return href
    ? <a href={href} data-embed="folder-chip" className={`${CHIP} hover:bg-selected`}>{inner}</a>
    : <span data-embed="folder-chip" className={CHIP}>{inner}</span>
}

const FOLDER: FileFactsAnswer = { state: 'folder' }

/**
 * `known`: the facts, when the caller already has them (an embed that turned out not to be an image). `folder`: the
 * reference was written as a folder (`files/reports/`), so nothing is asked.
 */
export function FileChip({ fileRef, children, context, known, folder }: {
  fileRef: SiteFileRef; children: ReactNode; context: MarkdownEmbedContext; known?: FileFactsAnswer; folder?: boolean
}) {
  const { answer, observe } = useChipFacts(fileRef, folder ? FOLDER : known)
  if (answer?.state === 'folder') return <span ref={observe}><FolderChip fileRef={fileRef} context={context}>{children}</FolderChip></span>
  const facts = answer?.state === 'ready' ? answer.facts : undefined
  const { Icon, kind } = chipFacts(nameOfRef(fileRef), facts)
  const gone = answer?.state === 'gone' || answer?.state === 'not-found'
  // A chip to nothing is drawn quietly, struck through, with why in its words; opened, the viewer says where it looked.
  const missing = answer?.state === 'gone' ? CHIP_GONE_WORDS : answer?.state === 'not-found' ? CHIP_NOT_FOUND_WORDS : null
  const className = gone ? `${CHIP_QUIET} line-through decoration-text-muted` : CHIP
  const inner = <ChipInner Icon={Icon} label={children} kind={missing ?? kind} />
  const open = context.onOpen
  return (
    <span ref={observe} data-embed="chip" data-gone={gone || undefined}>
      {open
        ? <button type="button" aria-label={missing ? `${nameOfRef(fileRef)} (${missing.toLowerCase()})` : undefined} className={`${className} ${gone ? 'hover:text-text-primary' : 'hover:bg-selected'}`} onClick={() => open(fileRef)}>{inner}</button>
        : <span className={className}>{inner}</span>}
      {changedSince(facts, context.writtenAt) && <ChangedSince />}
    </span>
  )
}

/** A stable link to a file of another place: the same chip, going to that place's address. */
export function LinkChip({ href, reference }: { href: string; reference: string }) {
  const name = reference.split('/').pop() || reference
  const { Icon, kind } = chipFacts(name, undefined)
  return (
    <a href={href} data-embed="link-chip" className={`${CHIP} hover:bg-selected`}>
      <ChipInner Icon={Icon} label={name} kind={kind} />
    </a>
  )
}

/** A file, folder or task named in a message still being written: the same chip, asking for nothing until the message is sent. */
export function DraftChip({ reference }: { reference: string }) {
  const parts = reference.split('/').filter(Boolean)
  const name = parts[parts.length - 1] || reference
  const task = parts[0] === 'tasks' && parts.length === 2
  const { Icon, kind } = task ? { Icon: SquareCheck, kind: 'Task' }
    : reference.endsWith('/') ? { Icon: Folder, kind: 'Folder' } : chipFacts(name, undefined)
  return (
    <span data-embed="draft-chip" title={reference} className={CHIP}>
      <ChipInner Icon={Icon} label={name} kind={kind} />
    </span>
  )
}
