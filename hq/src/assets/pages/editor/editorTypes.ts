/** What the editor's one read answers with (skills spec part 6 *The editor*; board U3b). Shared by hq's server and client. */
export type EditorTarget =
  | { kind: 'library'; assetId: string }
  | { kind: 'place'; placeSkillId: string }

export type EditorFileData = { path: string; base64: string }

export type EditorRevision = { number: number; by: string; at: string }

export type EditorView = {
  target: EditorTarget
  /** The skill's folder name; it runs under this name. */
  name: string
  /** `fernhill/release-notes`, or the folder's path in the place's files. */
  identity: string
  /** Where the skill lives, for the breadcrumb: "Library", "Your space" or a project's name. */
  where: string
  /** The draft's newest revision, or null when there is no draft and the files are what is in use. */
  revision: number | null
  files: EditorFileData[]
  /** The version in use (or the newest version of a place's skill): what Changes compares with. */
  base: EditorFileData[]
  baseLabel: string
  inUse: string | null
  draftBy: string | null
  revisions: EditorRevision[]
  /** False when the skill isn't the organisation's own: its draft lives in the organisation's copy. */
  editsHere: boolean
  notEditableReason: string | null
  mayPublish: boolean
  /** Library: the version each step would make. Place: the next number. */
  nextVersions: { patch: string; minor: string; major: string } | null
  nextNumber: number | null
  /** The agents that have it now (Library skills): who the publish reaches. */
  agentsWith: { everyAgent: boolean; names: string[] }
  warnings: string[]
}
