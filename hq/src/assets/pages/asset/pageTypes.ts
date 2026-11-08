/** What an asset's page reads (skills spec part 6 *An asset's page*; board U3). Client-safe: no server imports. */
import type { FileKind, TaskTemplateContent } from '@agenthix/core'

export type PageKind = 'skill' | 'agent' | 'board' | 'team' | 'task-template'

export type PageCan = {
  /** Edit and Ask an agent to edit (administrators and Library maintainers, D28). */
  edit: boolean
  /** Accept an update, roll back, switch to or from the organisation's copy. */
  update: boolean
  /** Choose which agents have it, and Remove (administrators, D17). */
  grant: boolean
  remove: boolean
  /** Switch a built-in skill on or off for the whole organisation (administrators). */
  switch: boolean
}

export type CarriedSkill = {
  identity: string
  title: string
  version: string
  /** Its own role skill, named under the template; false for a shared skill. */
  role: boolean
  /** What installing the template did with it, in words: Installed, Shared, Kept yours. */
  state: string
  assetId: string | null
}

export type MadeFrom = { name: string; version: string }

export type AssetPageView = {
  assetId: string
  kind: PageKind
  title: string
  description: string
  identity: string
  /** The version in use. */
  version: string | null
  builtIn: boolean
  switchedOff: boolean
  /** The organisation's own: made here or copied here, edited in place with a version for each save. */
  own: boolean
  /** The organisation's publisher name, which its own copies are published under. */
  orgPublisher: string | null
  unsigned: boolean
  /** "Signed by Acme (github.com/acme)", "Made here: …", "Built in", "Unsigned: …". */
  signedBy: string
  /** Where the package came from: the shelf, an upload, or a link. */
  source: string
  sourceUrl: string | null
  installedBy: string | null
  installedAt: string | null
  /** The newest version an update would move to. */
  update: { versionId: string; version: string } | null
  /** Someone's draft exists. */
  draftBy: string | null
  /** The organisation's copy that replaced it (this one is set aside). */
  setAsideFor: { assetId: string; identity: string } | null
  /** For the organisation's own copy: the original it was made from, shown under it (D18). */
  original: OriginalView | null
  /** For an original: the organisation's copies of it (D18). */
  copies: CopyView[]
  can: PageCan
  /** People by id, for who made each version and who moved the pin. */
  names: Record<string, string>
  /** The Library maintainers, by name: who to ask for what the viewer may not do. */
  maintainers: string[]
  /** Every agent in the organisation, for *Add an agent*; empty unless the viewer may choose. */
  agents: { id: string; name: string }[]
  /** Every agent's picture by id, for the avatars of who uses a skill; empty for a built-in. */
  agentAvatars: Record<string, string | null>
  carries: CarriedSkill[] | null
  madeFrom: MadeFrom[] | null
  /** A task template's types with their columns and fields with their options (spec D16); null for any other kind. */
  holds: TaskTemplateContent | null
  /** "Last used by Ada, today 11:05, in Website rebuild": the place only when the viewer may see it. */
  lastUsed: LastUsed | null
}

export type OriginalView = {
  assetId: string
  identity: string
  /** "Agenthix's Code Review", or the identity when nobody signed it. */
  name: string
  /** Its version in use, and the one the copy was made from. */
  version: string | null
  copiedFrom: string | null
  signedBy: string
  /** The original serves the agents: the copy is set aside, or not published yet. */
  inUse: boolean
  /** The copy was published since it was made: the first publish takes the original's place. */
  copyPublished: boolean
}

export type CopyView = {
  assetId: string
  identity: string
  version: string | null
  /** It serves the agents that had the original, which is set aside. */
  inUse: boolean
  /** Published since it was copied; a copy never published is still being made. */
  published: boolean
  draftBy: string | null
}

export type LastUsed = { by: string | null; at: string; where: string | null }

export type AssetFileView = { path: string; size: number; kind: FileKind; contentType: string; language?: string }

export type AssetContentView = {
  version: string
  /** Null when hq holds no copy of the file asked for. */
  files: AssetFileView[]
  opened: { path: string; base64: string } | null
}

export type FileChangeView = {
  path: string
  status: 'added' | 'modified' | 'removed'
  before: string | null
  after: string | null
  binary: boolean
}

export type AssetDiffView = { from: string | null; to: string; files: FileChangeView[] }

export type NewsDiffView = { original: string; copiedFrom: string; inUse: boolean; newer: { version: string; files: FileChangeView[] } | null }
