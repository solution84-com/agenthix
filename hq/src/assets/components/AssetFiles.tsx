import { useEffect, useMemo, useState } from 'react'
import { useQuery, getAssetContent } from 'wasp/client/operations'
import { needsFilesAddress, type FileOpenAnswer } from '@agenthix/core'
import { FileFrame, withMarkdown } from '@agenthix/ui/files'
import { renderMarkdownIn } from '../../shared/components/MarkdownMessage'
import type { AssetFileView } from '../pages/asset/pageTypes'

/** The answers' links never need renewing: the bytes are already in the page. */
const NEVER = 8.64e15

function bytesOf(base64: string): Uint8Array {
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function OpenedFile({ file, base64, fingerprint }: { file: AssetFileView; base64: string; fingerprint: string }) {
  const [link, setLink] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([bytesOf(base64) as BlobPart], { type: file.contentType }))
    setLink(url)
    return () => URL.revokeObjectURL(url)
  }, [base64, file.contentType])
  const registry = useMemo(() => withMarkdown(renderMarkdownIn()), [])
  const name = file.path.split('/').pop() ?? file.path
  const answer = useMemo<FileOpenAnswer | undefined>(() => {
    if (!link) return undefined
    const facts = { name, size: file.size, version: `${fingerprint}:${file.path}`, contentType: file.contentType, kind: file.kind, ...(file.language ? { language: file.language } : {}) }
    return needsFilesAddress(file.kind)
      ? { state: 'no-files-address', facts, downloadLink: link, expiresAt: NEVER }
      : { state: 'ready', facts, previewLink: link, downloadLink: link, expiresAt: NEVER }
  }, [link, name, file, fingerprint])
  return <FileFrame answer={answer} name={name} breadcrumb={file.path.split('/').slice(0, -1)} layout="narrow" mode="opened" registry={registry} onReopen={() => undefined} />
}

/**
 * An asset's files at one version, drawn by the file frame's renderers (adr-0155): the file in front, and a button
 * for each of the others. The version in use unless `versionId` names another.
 */
export function AssetFiles({ assetId, versionId }: { assetId: string; versionId?: string }) {
  const [path, setPath] = useState<string | undefined>(undefined)
  const { data, error, isLoading } = useQuery(getAssetContent, { assetId, ...(versionId ? { versionId } : {}), ...(path ? { path } : {}) })
  if (error) return <p role="alert" className="text-small text-danger">{error.message}</p>
  if (isLoading && !data) return <p className="text-small text-text-muted">Loading…</p>
  if (!data?.opened) return <p className="text-small text-text-secondary">This version has no files to show.</p>
  const opened = data.files.find(f => f.path === data.opened!.path)
  return (
    <div className="space-y-3" data-testid="asset-files">
      {data.files.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Its files">
          {data.files.map(f => (
            <button key={f.path} type="button" aria-pressed={f.path === data.opened!.path} onClick={() => setPath(f.path)}
              className={`rounded-md border px-2 py-0.5 text-micro ${f.path === data.opened!.path ? 'border-accent text-accent' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}>
              {f.path}
            </button>
          ))}
        </div>
      )}
      {opened && <OpenedFile key={`${data.version}:${opened.path}`} file={opened} base64={data.opened.base64} fingerprint={`${assetId}@${data.version}`} />}
    </div>
  )
}
