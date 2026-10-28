/** What the agent's Skills section reads (spec part 6 *The agent's page*): everything it will see, in the clash order. */
export type AgentSkillLine = {
  assetId: string
  /** `publisher/name`. */
  identity: string
  title: string
  description: string
  version: string
  signer: string
  /** The newest version an update would move to. */
  updateTo: string | null
}

export type AgentBuiltInLine = {
  assetId: string
  identity: string
  title: string
  description: string
  version: string
  on: boolean
  /** Given only to runs that work in a repository. */
  repositoryOnly: boolean
}

export type AgentPlaceLine = {
  projectId: string
  projectKey: string
  name: string
  on: number
  off: number
  setAside: number
  /** The names of those that run, for the one line. */
  onNames: string[]
}

export type AgentSetAsideLine = {
  name: string
  /** Where it was found, or the Library. */
  where: string
  reason: string
}

export type AgentSkillsView = {
  agent: { id: string; name: string }
  /** Administrators add and remove; everyone else reads. */
  mayManage: boolean
  builtIn: AgentBuiltInLine[]
  everyAgent: AgentSkillLine[]
  thisAgent: AgentSkillLine[]
  places: AgentPlaceLine[]
  /** Places the agent works in that the viewer isn't in: counted, never named or opened. */
  hiddenPlaces: number
  setAside: AgentSetAsideLine[]
  /** The viewer's own switched-on skills, which join their conversations with this agent. */
  yours: { name: string; description: string }[]
  /** Every listed skill: built in and on, every agent's, this agent's, and those that run in its places. */
  listed: { name: string; description: string }[]
  /** Installed skills this agent doesn't have yet, for the picker (administrators only). */
  addable: AgentSkillLine[]
}
