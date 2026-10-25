import { useState } from 'react'
import { OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import { mentionInMessage } from '@agenthix/ui/sessions'
import { FILES_BUTTON, FilesViewHeader, changedLabel, kindAndSize, type ListedEntry } from '@agenthix/ui/projects'
import type { FileContent } from '../fileContentService'
import { FileBody } from './FileBody'
import { mentionReference, type FilesToolKind } from './fileReferences'
import { useFileContent, type Target } from './filesToolData'
import { copyText as copy } from '../../shared/copyText'

export interface FileOpenedProps {
  kind: FilesToolKind
  target: Target
  /** The path inside the tool's folder; for an artefact, its file name. */
  path: string
  /** What the list knew of it: size and time. Absent when the list was not read. */
  entry?: ListedEntry
  /** The title; a knowledge page's is not its file name. */
  title?: string
  /** "Files", "Artefacts": where ‹ goes. */
  backLabel: string
  onBack: () => void
  /** Drawn in the panel's one header row (narrow), or as a row of its own beside the folders (wide). */
  embedded?: boolean
}

function download(name: string, content: FileContent | undefined): OverflowItem[] {
  if (!content) return []
  if (content.kind === 'image') {
    return [{ label: 'Download', onSelect: () => save(name, content.dataUrl) }]
  }
  if (content.kind === 'markdown' || content.kind === 'code') {
    return [{ label: 'Download', onSelect: () => save(name, URL.createObjectURL(new Blob([content.text], { type: 'text/plain' }))) }]
  }
  return []
}

function save(name: string, href: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = name
  link.click()
}

/**
 * A file or a knowledge page opened inside its tool (spec §3): its title and when it changed, the content rendered, and
 * **Mention**, which puts a reference to it into the message being written beside it.
 */
export function FileOpened({ kind, target, path, entry, title, backLabel, onBack, embedded }: FileOpenedProps) {
  const content = useFileContent(kind, target, path)
  const [notice, setNotice] = useState('')
  const name = path.split('/').pop() ?? path
  const reference = mentionReference(kind, path)

  const mention = async () => {
    if (mentionInMessage(reference)) { setNotice(''); return }
    // No message box is open beside the tool (the conversations list): keep the reference where it can be pasted.
    setNotice((await copy(reference)) ? `Copied ${reference} — paste it into a message.` : `Mention ${reference} in your message.`)
  }

  const menu = [
    ...download(name, content.data),
    { label: 'Copy path', onSelect: async () => { setNotice((await copy(reference)) ? 'Path copied.' : reference) } },
  ]
  const actions = (
    <>
      <button type="button" className={FILES_BUTTON} onClick={() => void mention()}>Mention</button>
      <OverflowMenu items={menu} />
    </>
  )
  const changed = entry?.modifiedAt ? `Changed ${changedText(entry.modifiedAt)}` : null
  const facts = [changed, entry?.size !== undefined ? kindAndSize({ name, size: entry.size }) : null].filter(Boolean).join(' · ')

  return (
    <>
      {embedded ? (
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
          <h3 className="min-w-0 flex-1 truncate text-h3 font-semibold text-text-primary">{title ?? name}</h3>
          {actions}
        </div>
      ) : (
        <FilesViewHeader back={backLabel} onBack={onBack} title={title ?? name} action={<>{actions}</>} />
      )}
      {(facts || notice) && (
        <p role="status" className="px-4 pt-3 text-small text-text-muted">{[facts, notice].filter(Boolean).join(' · ')}</p>
      )}
      <FileBody content={content.data} isLoading={content.isLoading} error={content.error} />
    </>
  )
}

function changedText(modifiedAt: string): string {
  const label = changedLabel(modifiedAt)
  if (/^\d\d:\d\d$/.test(label)) return `today ${label}`
  return label === 'Yesterday' ? 'yesterday' : label
}
