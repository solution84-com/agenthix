import { useMemo } from 'react'
import type { LocationRef } from '@agenthix/core'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { useTaskFolder } from '../hooks/useTaskFiles'
import { foldersNamed, remarkTaskFiles } from './taskFileLinks'

/** How many folders one text's paths are checked in: a result naming files in more folders links those of the first. */
const FOLDERS = 4

/** The listing of the text's nth folder; none when the text names fewer. */
function useFolderSlot(loc: LocationRef | null, folder: string | undefined) {
  return useTaskFolder(folder === undefined ? null : loc, folder ?? '')
}

/**
 * A run's result, or a step of a run, drawn as the task's text: a path it writes that names a file of the task's own
 * folder is a link opening the file beside the task. The folders the paths are in are listed to know which are
 * files; while they load, or when they cannot be read, the text is drawn without the links.
 */
export function TaskResultMarkdown({ content, className, embed, loc }: {
  content: string
  className?: string
  embed?: MarkdownEmbedContext
  loc: LocationRef | null
}) {
  const named = embed && loc ? foldersNamed(content, FOLDERS) : []
  // A fixed number of reads, each idle when the text names fewer folders.
  const listed = [
    useFolderSlot(loc, named[0]), useFolderSlot(loc, named[1]), useFolderSlot(loc, named[2]), useFolderSlot(loc, named[3]),
  ]
  const key = listed.map((l, i) => `${named[i] ?? ''}:${(l.entries ?? []).filter(e => !e.isDir).map(e => e.name).join('|')}`).join('/')
  const plugins = useMemo(() => {
    const files = new Set<string>()
    listed.forEach((l, i) => {
      const folder = named[i]
      if (folder === undefined) return
      for (const e of l.entries ?? []) if (!e.isDir) files.add(folder ? `${folder}/${e.name}` : e.name)
    })
    return files.size > 0 ? [[remarkTaskFiles, { files }] as [typeof remarkTaskFiles, { files: Set<string> }]] : undefined
    // Made again only when a listing's files change.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return <MarkdownMessage content={content} className={className} embed={embed} moreRemarkPlugins={plugins} />
}
