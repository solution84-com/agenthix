import { useMemo } from 'react'
import { useQuery, getAssetContent } from 'wasp/client/operations'
import { CodeEditor } from '@agenthix/ui/editor'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { bytesOfBase64, bytesOfText, SKILL_FILE_NAME, textOf } from '../../editor/editorFiles'
import { skillMdParts } from '../../editor/skillMdParts'
import { ViewFile } from '../../editor/ViewFile'
import type { AssetFileView } from '../pageTypes'
import { pressFailureWords } from '../../../../shared/failureWords'

/** A version's file list and one file's bytes: the version in use unless `versionId` names another. */
export function useSkillFile(assetId: string, versionId: string | null, path: string | null) {
  const query = useQuery(getAssetContent, { assetId, ...(versionId ? { versionId } : {}), ...(path ? { path } : {}) })
  const { data, error, isLoading, refetch } = query
  const read = useBackgroundRead(query, { what: 'The file' })
  const opened = useMemo(() => (data?.opened ? { path: data.opened.path, bytes: bytesOfBase64(data.opened.base64) } : null), [data])
  return { files: (data?.files ?? []) as AssetFileView[], opened, error: error ? pressFailureWords(error) : null, read, loading: isLoading && !data, retry: () => void refetch() }
}

/**
 * SKILL.md's name and description as a card above its body (owner's area 8 walk, finding 7): the full width of the text,
 * a thin border and rounded corners with no fill, small muted labels in a narrow column, a hairline between the rows,
 * the name as a small code chip and the description as ordinary text.
 */
export function SkillMdCard({ name, description }: { name: string; description: string }) {
  const none = <span className="text-text-muted">none</span>
  return (
    <dl className="mb-4 w-full rounded-lg border border-border text-small" data-testid="skill-md-card">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-border-subtle px-3 py-2">
        <dt className="text-micro text-text-muted">Name</dt>
        <dd className="min-w-0">{name ? <code className="break-all rounded bg-surface-2 px-1.5 py-0.5 font-mono text-micro text-text-primary">{name}</code> : none}</dd>
      </div>
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-2">
        <dt className="text-micro text-text-muted">Description</dt>
        <dd className="min-w-0 break-words text-body text-text-primary">{description || none}</dd>
      </div>
    </dl>
  )
}

/**
 * One file of a skill, read (board *A skill's page* 1): SKILL.md as a page, its name and description a card
 * above its body; *Source* the file as written, its lines numbered; any other file as the file frame's renderers draw it. The page's header holds the one Read / Source switch, so the viewer draws none
 * and no details line (they are the heading's tooltip: `fileDetails`).
 */
export function SkillFileRead({ path, bytes, source }: { path: string; bytes: Uint8Array; source: boolean }) {
  const text = textOf(bytes)
  const parts = useMemo(() => (text !== null && path === SKILL_FILE_NAME ? skillMdParts(text) : null), [text, path])
  const body = useMemo(() => (parts ? bytesOfText(parts.body) : null), [parts])
  if (source && text !== null) {
    return <div data-testid="file-source"><CodeEditor value={text} fileName={path} label={`${path}, as written`} readOnly /></div>
  }
  if (parts?.fields && body) {
    return (
      <div data-testid="skill-md-read">
        <SkillMdCard {...parts.fields} />
        <ViewFile file={{ path, bytes: body }} bare />
      </div>
    )
  }
  return <ViewFile file={{ path, bytes }} bare />
}
