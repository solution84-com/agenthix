import { useEffect, useMemo, useState } from 'react'
import { chooseFileKind, type FileBytes, type FileFacts, type RendererReport } from '@agenthix/core'
import { withMarkdown } from '@agenthix/ui/files'
import { renderMarkdownIn } from '../../../shared/components/MarkdownMessage'
import { textOf, type EditorFile } from './editorFiles'

const registry = withMarkdown(renderMarkdownIn())

/** A file's bytes held in memory, as the renderers read them: from where they are in the editor, not from a relay. */
function memoryBytes(bytes: Uint8Array, link: string): FileBytes {
  return {
    link,
    read: async limit => ({ bytes: bytes.slice(0, limit), whole: bytes.length <= limit }),
    range: async (start, end) => bytes.slice(start, end + 1),
  }
}

/**
 * View (board U3b, E2): the file as it reads, drawn by the file frame's renderers (adr-0155) from what is in the editor
 * now. Active code never runs here: a PDF, which the frame draws in a sandboxed viewer on the files address, is offered
 * as a size only, since the draft has no address of its own.
 */
export function ViewFile({ file, bare = false }: {
  file: EditorFile
  /** The host draws its own Read / Source and details: Markdown is shown embedded, and no details line. */
  bare?: boolean
}) {
  const [report, setReport] = useState<RendererReport>()
  const [fact, setFact] = useState('')
  const looksText = textOf(file.bytes) !== null
  const choice = useMemo(() => chooseFileKind(file.path, looksText), [file.path, looksText])
  const renderer = registry.find(choice.kind)
  // A blob address for an image's `<img>`; made once per content and revoked after.
  const [link, setLink] = useState('')
  useEffect(() => {
    if (choice.kind !== 'image') { setLink(''); return }
    const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: choice.contentType }))
    setLink(url)
    return () => URL.revokeObjectURL(url)
  }, [file.bytes, choice.kind, choice.contentType])
  useEffect(() => { setReport(undefined); setFact('') }, [file.path, file.bytes])

  const facts: FileFacts = {
    name: file.path.split('/').pop() ?? file.path, size: file.bytes.length, version: String(file.bytes.length),
    contentType: choice.contentType, kind: choice.kind, language: choice.language,
  }
  const bytes = useMemo(() => memoryBytes(file.bytes, link), [file.bytes, link])
  const size = `${file.bytes.length.toLocaleString('en-GB')} bytes`

  if (file.bytes.length === 0) return <p className="text-small text-text-secondary">This file is empty.</p>
  if (!renderer || !renderer.render || renderer.runs === 'frame' || (choice.kind === 'image' && !link)) {
    return <p className="text-small text-text-secondary" data-testid="view-unavailable">{choice.kind === 'pdf' ? 'A PDF is shown once it is published. ' : 'This kind of file has no preview. '}It is {size}.</p>
  }
  return (
    <div data-testid="view-file">
      {report?.state === 'failed' && <p role="status" className="mb-2 text-small text-text-secondary">This file could not be shown ({report.reason}). It is {size}.</p>}
      {!bare && <p className="mb-2 text-micro text-text-muted">{[facts.contentType, size, fact].filter(Boolean).join(' · ')}</p>}
      {renderer.render({ facts, bytes, link, mode: bare && choice.kind === 'markdown' ? 'embedded' : 'opened', report: setReport, fact: setFact })}
    </div>
  )
}
