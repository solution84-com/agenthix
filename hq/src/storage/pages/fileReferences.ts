export type FilesToolKind = 'files' | 'artefacts' | 'knowledge'

/** What Mention puts into the message box: the file's path in the place, which agents see as its folder. */
export function mentionReference(kind: FilesToolKind, path: string): string {
  return `${kind}/${path}`
}

const ARTEFACT_LINK = /^(?:\.\/)?artefacts\/([^/?#]+)$/

/** The file an agent's link `artefacts/<file name>` points at, or null for any other link. */
export function artefactNameFromHref(href: string | null): string | null {
  const match = href ? ARTEFACT_LINK.exec(href) : null
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
