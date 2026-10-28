/** What the Library's one view reads (skills spec part 6 *The Library*): every installed asset as a row. */
export type LibraryKindId = 'skill' | 'agent' | 'board' | 'team'

export const LIBRARY_STATUSES = ['waiting', 'update', 'draft', 'noAgent', 'setAside', 'unsigned'] as const
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number]

export type LibraryAssetRow = {
  /** The asset's id, or `proposal:<id>` for a proposal waiting for review. */
  key: string
  assetId: string | null
  proposalId: string | null
  kind: LibraryKindId
  title: string
  description: string
  /** `publisher/name`, or just the name for unsigned assets. */
  identity: string
  version: string | null
  /** Built in, Signed by Agenthix, Signed by Acme (github.com/acme), Unsigned, or Made here. */
  signer: string
  /** Who has it, in words: a template says how many things were made from it. */
  has: string
  builtIn: boolean
  /** A built-in skill's switch for the organisation. */
  switchedOff: boolean
  statuses: LibraryStatus[]
  /** The newest version an update would move to. */
  updateTo: string | null
  /** The person whose draft it is. */
  draftBy: string | null
  /** Who proposed it, for a proposal. */
  proposedBy: string | null
  /** The own copy that replaced it, for a set-aside asset. */
  setAsideFor: string | null
}

export type LibraryAssets = {
  rows: LibraryAssetRow[]
  /** Administrators: Export, Settings, switches. */
  isAdmin: boolean
  /** May install here: Add is shown. */
  mayAdd: boolean
  /** The Marketplace button is shown (feature flag, adr-0116). */
  marketplace: boolean
}
