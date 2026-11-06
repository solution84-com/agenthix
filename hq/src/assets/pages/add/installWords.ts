/** The words of the install dialogs, as the spec and board U4 write them (spec part 3 *The four states*). */
import type { InstallPreview } from '../../install/types'

export type DialogState = 'trusted' | 'new-publisher' | 'unsigned' | 'refused'

export function dialogState(p: InstallPreview): DialogState {
  if (p.refusal) return 'refused'
  if (p.state === 'new-publisher') return 'new-publisher'
  if (p.state === 'unsigned') return 'unsigned'
  return 'trusted'
}

export const sourceWords = (p: Pick<InstallPreview, 'source' | 'sourceUrl'>): string =>
  p.source === 'url' ? `from ${(p.sourceUrl ?? 'a link').replace(/^https:\/\//, '')}` : p.source === 'upload' ? 'uploaded' : 'from Agenthix'

/** The title: what the dialog is about, in the state's words. */
export function titleOf(p: InstallPreview): string {
  return p.refusal ? `Can't install ${p.title}` : `Install ${p.title}?`
}

export const UNSIGNED_WORDS = "This isn't signed. Agenthix can't tell who made it or whether it was changed on the way. Read it before you install it."

export const NEW_PUBLISHER_WARNING = "A signature tells you who published it, not that it's safe."

/** After installing: what happened, in words, and the next step (board U4 *It says what it did*). */
export function installedWords(title: string, version: string, outcome: string): string {
  if (outcome === 'same') return `${title} ${version} is already in the Library. Nothing new was installed.`
  if (outcome === 'update') return `${title} ${version} is in the Library as an update. It stays at the version in use until you update it.`
  if (outcome === 'older') return `You already have a newer ${title}. Nothing was changed.`
  return `${title} ${version} is in the Library.`
}
