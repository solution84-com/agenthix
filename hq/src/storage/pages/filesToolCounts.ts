import { visibleEntries, type ListedEntry } from '@agenthix/ui/projects'

export interface FilesToolCounts {
  files?: string
  artefacts?: string
  knowledge?: string
  workspaces?: string
}

/** What each of the four tools shows beside its name in the tools list: nothing until its list has been read. */
export function filesToolCounts(read: {
  files?: ListedEntry[]
  artefacts?: ListedEntry[]
  pages?: unknown[]
  workspaces?: unknown[]
}): FilesToolCounts {
  return {
    files: read.files && String(visibleEntries(read.files).length),
    artefacts: read.artefacts && String(read.artefacts.length),
    knowledge: read.pages && `${read.pages.length} ${read.pages.length === 1 ? 'page' : 'pages'}`,
    workspaces: read.workspaces && String(read.workspaces.length),
  }
}
