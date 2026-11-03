import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, getGitFile } from 'wasp/client/operations'
import { FilesQuietLine } from '@agenthix/ui/projects'
import type { BranchRef, GitFileView } from '../../branches/views'
import { OpenedFile } from '../../storage/pages/OpenedFile'
import { gitFileAnswer } from '../gitFileAnswer'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { workspaceViewPath } from '../viewAddress'

export interface ViewWorkspace {
  id: string
  name: string
  ownerType: 'project' | 'user'
  ownerId: string
}

/**
 * A file of the chosen branch (or `main`) in the middle, in HQ's own file viewer (spec part 1, *Files*). Its text is
 * read from Git at the branch's tip; a binary or very large file is named, not drawn. Nothing here edits it.
 */
export function GitFileMiddle({ workspace, gitRef, branchName, path, layout, onBack }: {
  workspace: ViewWorkspace
  gitRef: BranchRef
  branchName: string
  path: string
  layout: 'wide' | 'narrow'
  onBack: () => void
}) {
  const { data, error, refetch } = useQuery(getGitFile, { workspaceId: workspace.id, ref: gitRef, at: 'tip', path })
  useOnWorkspaceChange(refetch)
  const view = data as GitFileView | undefined
  const name = path.split('/').pop() ?? path

  if (error) return <FilesQuietLine role="status">{error.message}</FilesQuietLine>
  if (!view) return <FilesQuietLine>Loading…</FilesQuietLine>
  if (!view.exists) return <FilesQuietLine role="status">{name} isn&apos;t on {branchName}.</FilesQuietLine>
  if (view.binary) return <FilesQuietLine role="status">{name} is a binary file ({sizeText(view.bytes)}); it is not shown here.</FilesQuietLine>
  if (view.tooLarge || view.text === null) return <FilesQuietLine role="status">{name} is too large to show here ({sizeText(view.bytes)}).</FilesQuietLine>
  return (
    <TextFile workspace={workspace} branchName={branchName} path={path} text={view.text} layout={layout} onBack={onBack} />
  )
}

function TextFile({ workspace, branchName, path, text, layout, onBack }: {
  workspace: ViewWorkspace
  branchName: string
  path: string
  text: string
  layout: 'wide' | 'narrow'
  onBack: () => void
}) {
  const source = useGitFileSource(path, text, `${workspace.id}:${branchName}:${path}:${text.length}:${hash(text)}`)
  const folders = path.split('/').slice(0, -1)
  return (
    <OpenedFile
      file={{ space: 'place', loc: { ownerType: workspace.ownerType, ownerId: workspace.ownerId, workspaceId: workspace.id, taskId: null }, path }}
      kind="files" path={path} breadcrumb={[workspace.name, ...folders]}
      backLabel={branchName} onBack={onBack} layout={layout}
      link={{ branch: branchName === 'main' ? null : branchName, section: 'files', file: path }}
      linkBase={workspaceViewPath(workspace.id)}
      source={source}
    />
  )
}

/**
 * The viewer's source for a file's text: each open makes a blob link and lets go of the one before. The last link is
 * let go of only once the file is really gone from the screen: React's development double mount runs the unmount
 * cleanup at once, and the viewer's first open, taken over across that remount, still holds the link.
 */
export function useGitFileSource(path: string, text: string, key: string) {
  const shown = useRef<string | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      setTimeout(() => {
        if (mounted.current || !shown.current) return
        URL.revokeObjectURL(shown.current)
        shown.current = null
      }, 0)
    }
  }, [])
  const open = useCallback(async () => {
    const { answer, link } = gitFileAnswer(path, text, key)
    if (shown.current) URL.revokeObjectURL(shown.current)
    shown.current = link
    return answer
  }, [path, text, key])
  return useMemo(() => ({ key, open }), [key, open])
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A short fingerprint of the text, so a new version of the same file opens afresh. */
function hash(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
