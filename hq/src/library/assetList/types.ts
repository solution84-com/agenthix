/** What the Library's one view reads (skills spec part 6 *The Library*): every installed asset as a row. */
export type LibraryKindId = 'skill' | 'agent' | 'board' | 'team' | 'task-template'

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
  /** The agents that have it, by name, for the search; a template says how many things were made from it. */
  has: string
  /** A skill: how many chosen agents have it. */
  agentCount: number
  /** Up to two of the agents that use it, for the avatars; `agentsUsingCount` is how many there are in all. */
  agentsUsing: Array<{ id: string; name: string; avatarUrl: string | null }>
  agentsUsingCount: number
  /** A skill every agent has. */
  everyAgent: boolean
  /** A template: how many things were made from it. */
  madeCount: number | null
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
  /** The own copy that replaced it, for a set-aside asset that is still a row of its own. */
  setAsideFor: string | null
  /**
   * What this entry stands for besides itself (spec part 2 *Editing makes your own copy*, D18): the set-aside original
   * under the copy that replaced it, or the organisation's copy not in use under the original. Not rows of their own.
   */
  partners: LibraryPartner[]
}

export type LibraryPartner = {
  assetId: string
  relation: 'original' | 'copy'
  identity: string
  version: string | null
  /** "Agenthix's Code Review 2.0.0" for an original; the identity and version for a copy. */
  words: string
  /** Its own states, which find the entry too: Set aside, Draft. */
  statuses: LibraryStatus[]
  draftBy: string | null
}

export type LibraryAssets = {
  rows: LibraryAssetRow[]
  /** Administrators: Export, Settings, switches. */
  isAdmin: boolean
  /** May install here: Add is shown. */
  mayAdd: boolean
  /** May install from Agenthix's shelf. */
  mayAddFromAgenthix: boolean
  /** May install an upload or a link. */
  mayAddFromOutside: boolean
  /** May make an organisation skill: New skill is shown. */
  mayMake: boolean
  /** The Marketplace button is shown (feature flag, adr-0116). */
  marketplace: boolean
}
