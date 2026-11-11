import { useQuery, findLocationFiles } from 'wasp/client/operations'
import { FileRow, FilesQuietLine, changedLabel, kindAndSize } from '@agenthix/ui/projects'
import { ReadNudge, siteReadRetry, useSiteRead } from '../../shared/siteRead'
import type { Target } from './filesToolData'

type Found = { path: string; name: string; folder: string; size: number; modifiedAt: string }

/** "No files match “revenue”.": what a search that found nothing says, never that the folder is empty. */
export const noFilesMatch = (query: string) => `No files match “${query.trim()}”.`

/**
 * Search files (S5): every file of the place whose name holds what was typed, in any folder, each with the folder it
 * is in. The site finds them; a click opens one.
 */
export function FoundFiles({ target, query, selected, onOpenFile }: {
  target: Target
  query: string
  selected: string | null
  onOpenFile: (path: string) => void
}) {
  const fragment = query.trim()
  const loc = { ownerType: target.ownerType, ownerId: target.ownerId, workspaceId: target.workspaceId ?? null, taskId: null }
  const search = useQuery(findLocationFiles, { target: loc, fragment }, { enabled: fragment.length > 0, retry: siteReadRetry })
  const { data, isLoading } = search
  const read = useSiteRead(search, { what: 'The files that match' })
  const now = new Date()
  if (read.failedWithoutData) return <ReadNudge read={read} />
  if (isLoading || !data) return <FilesQuietLine>Searching…</FilesQuietLine>
  const files = (data as { files: Found[]; truncated: boolean }).files
  if (files.length === 0) return <FilesQuietLine role="status">{noFilesMatch(query)}</FilesQuietLine>
  return (
    <div role="list" aria-label="Files that match">
      {files.map(f => (
        <div role="listitem" key={f.path}>
          <FileRow
            name={f.name} meta={`${f.folder ? f.folder.split('/').join(' › ') : 'Files'} · ${kindAndSize({ name: f.name, size: f.size })}`}
            when={changedLabel(f.modifiedAt, now)} selected={selected === f.path} onOpen={() => onOpenFile(f.path)}
          />
        </div>
      ))}
      {data.truncated && <FilesQuietLine>Only the first matches are shown. Type more of the name to find the one you want.</FilesQuietLine>}
    </div>
  )
}
