/**
 * The demo's seed data set (adr-0186): the sample organisation hq and the site both build at start in demo mode, from
 * the files in `demo/seed/`. hq builds its part (people, projects, tasks, library, models) and the site its part (runs,
 * transcripts, workspaces, files, Knowledge), and they agree without talking because every row the two share carries
 * a fixed identifier written here, never one the database makes.
 *
 * Within the data a thing is named by its `key` (a person's `sam`, a task's `WEB-2`); the key is stable, the `id` is
 * what the databases hold. Times are minutes from the moment the seed runs, negative for the past, so a run is dated
 * "yesterday" whenever the install starts.
 */

/** Minutes from now; negative is the past. */
export type SeedMinutes = number

/**
 * A picture's recipe (hq's ADR-0187): what hq draws the picture from when the demo is seeded. Opaque here; hq checks
 * every part of it against its style registry, and refuses to seed one it does not accept.
 */
export type SeedPictureRecipe = { v: number; kind: 'avatar' | 'cover'; style: string; styleVersion: number; choices: Record<string, unknown> }

export type SeedPerson = {
  key: string
  id: string
  username: string
  displayName: string
  role: 'ADMIN' | 'MEMBER'
  /** A person keeps their initials as their avatar; the sample's people each have a cover. */
  cover: SeedPictureRecipe
}

export type SeedTeam = {
  key: string; id: string; name: string; purpose: string; createdBy: string; people: string[]; agents: string[]
  avatar: SeedPictureRecipe; cover: SeedPictureRecipe
}

/** `avatar` is the robot that suits the agent's role; `avatarWithoutRobots` is drawn instead where hq has no robots. */
export type SeedAgent = {
  key: string; id: string; name: string; handle: string; role: string; instructions: string
  avatar: SeedPictureRecipe; avatarWithoutRobots: SeedPictureRecipe; cover: SeedPictureRecipe
}

export type SeedProjectMember = { person: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER'; direct?: boolean }

export type SeedProject = {
  key: string
  id: string
  name: string
  description: string
  /** Null for a project with no address of its own (a personal one). */
  slug: string | null
  lead: string
  defaultAgent: string
  createdAt: SeedMinutes
  private?: boolean
  personalOwner?: string
  agentSchedules?: boolean
  billingProfile?: string
  members: SeedProjectMember[]
  teams: { team: string; role: 'ADMIN' | 'MEMBER' }[]
  agents: string[]
  pinnedBy: string[]
}

export type SeedColumn = { name: string; state: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE'; colour: string; defaultForState: boolean }

/** A task type a project makes besides its built-in Task and Epic, with the board that shows it. */
export type SeedTaskType = { key: string; project: string; name: string; icon: string; columns: SeedColumn[]; board: { id: string; name: string } | null }

export type SeedMilestone = { id: string; project: string; name: string; at: SeedMinutes }

export type SeedTask = {
  key: string
  id: string
  project: string
  number: number
  title: string
  description: string | null
  /** `TASK` or `EPIC` (the built-in types), or the key of a `SeedTaskType`. */
  type: string
  column: string | null
  agent: string | null
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  person: string
  epic?: string
  planStart?: SeedMinutes
  planFinish?: SeedMinutes
  milestone?: string
  labels?: string[]
  runState?: 'RUN_BLOCKED' | 'RUN_FAILED' | 'RUN_NONE'
  runStateReason?: string
  runStartedBy?: 'person' | 'schedule'
  createdAt: SeedMinutes
  doneAt?: SeedMinutes
  /** A start time the task waits for. */
  scheduleAt?: SeedMinutes
}

export type SeedComment = { task: string; by: { person: string } | { agent: string }; content: string; at: SeedMinutes }

export type SeedAttachment = { task: string; uuid: string; fileName: string; mimeType: string; sizeBytes: number; at: SeedMinutes }

export type SeedRoutine = {
  id: string
  project: string
  title: string
  instructions: string
  agent: string
  person: string
  cron: string
  nextDueAt: SeedMinutes
  runs: { id: string; number: number; dueAt: SeedMinutes; startedAt: SeedMinutes; endedAt: SeedMinutes }[]
}

/** A sprint in a project's one series, with the tasks planned into it. */
export type SeedSprint = { id: string; project: string; number: number; name: string; goal: string; start: SeedMinutes; days: number; tasks: string[] }

/**
 * An invitation still waiting to be accepted. Its link's token is made at seed time and never kept, so nobody can
 * accept it: it only shows.
 */
export type SeedInvitation = { note: string; role: 'ADMIN' | 'MEMBER'; projects: string[]; createdBy: string; at: SeedMinutes; expiresAt: SeedMinutes }

export type SeedOrganisation = {
  org: {
    name: string; handle: string; mission: string; vision: string; setupCompletedAt: SeedMinutes; timeZone: string; agentSchedules: boolean
    avatar: SeedPictureRecipe; cover: SeedPictureRecipe
  }
  people: SeedPerson[]
  teams: SeedTeam[]
  agents: SeedAgent[]
  projects: SeedProject[]
  taskTypes: SeedTaskType[]
  milestones: SeedMilestone[]
  tasks: SeedTask[]
  comments: SeedComment[]
  attachments: SeedAttachment[]
  routines: SeedRoutine[]
  sprints: SeedSprint[]
  invitations: SeedInvitation[]
}

/** One run of an agent, with its opening message, at most one tool call and how it ended. */
export type SeedRun = {
  id: string
  /** When it started. */
  at: SeedMinutes
  input: string
  output: string | null
  status: 'COMPLETED' | 'FAILED'
  error?: string
  tool?: { name: string; input: Record<string, unknown>; output: string }
  /** A run that did not finish with an answer: a failure, or a wait for a person's approval. */
  endsWith?: { kind: 'RUN_FAILED'; reason: string } | { kind: 'APPROVAL_REQUESTED'; tools: { name: string; reason: string }[]; bashPatterns: { pattern: string; reason: string }[] }
}

/** A session on the site and the same session's row in hq, with the same id; a task's session names its task. */
export type SeedSession = {
  id: string
  sessionKey: string
  agent: string
  person: string
  title: string
  task: string
  at: SeedMinutes
  run: SeedRun
}

export type SeedConversation = {
  id: string
  agent: string
  openedBy: string
  /** A project's key when the conversation is in a project; none for a person's own. */
  project?: string
  title: string
  at: SeedMinutes
  asked: string
  answer: string
}

export type SeedNotification = { person: string; type: string; title: string; body: string; actionLabel: string; actionUrl: string; at: SeedMinutes }

/** `model` is the name the seeded sessions and runs record; nothing is called. */
export type SeedActivity = { model: string; sessions: SeedSession[]; conversations: SeedConversation[]; notifications: SeedNotification[] }

export type SeedWorkflowRun = {
  id: string
  person: string
  at: SeedMinutes
  durationSeconds: number
  state: 'PASSED' | 'FAILED'
  failure?: { code: string; message: string }
  /** The output of each step, in order; a failed run's later steps are skipped. */
  steps: { output: string; exitCode: number | null; skipped?: boolean }[]
}

export type SeedWorkflow = {
  id: string
  /** The project that owns it. */
  project: string
  name: string
  description: string
  steps: { name: string; run: string }[]
  variables: string[]
  approvedBy: string
  approvedAt: SeedMinutes
  runs: SeedWorkflowRun[]
}

/**
 * An organisation skill. `places` are the projects it was added to with *Add to this place*: each needs the copy's
 * `SKILL.md` among `site.files`, at `.agents/skills/<name>/SKILL.md`, exactly as hq writes it there (hq checks it at start).
 */
export type SeedSkill = { name: string; description: string; body: string; givenToAll: boolean; grantedTo: string[]; madeBy: string; at: SeedMinutes; places: string[] }

export type SeedSecret = { project: string; name: string; description: string; issuer: string; renewAt: string; createdBy: string; at: SeedMinutes }

export type SeedVariable = { project: string; name: string; value: string; createdBy: string }

export type SeedProvider = { key: string; vendor: string; name: string }

export type SeedUsage = {
  project: string
  agent: string
  person: string
  purpose: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  /** Millionths of a dollar; null for a call a subscription covers. */
  costMicros: number | null
  basis: 'ESTIMATED' | 'INCLUDED'
}

export type SeedLibrary = {
  skills: SeedSkill[]
  workflows: SeedWorkflow[]
  secrets: SeedSecret[]
  variables: SeedVariable[]
  providers: SeedProvider[]
  defaults: {
    conversation: { provider: string; model: string }
    stt: { provider: string; model: string }
    tts: { provider: string; model: string; voice: string }
  }
  billingProfiles: { key: string; name: string | null; isDefault: boolean; createdBy: string }[]
  usage: SeedUsage[]
}

/** The folder of one place's Knowledge: a project's, or the organisation's. */
export type SeedKnowledge = {
  owner: { project: string } | { org: true }
  /** Whether the guide's own sample has these pages (it leaves out what the demo adds). */
  inGuide: boolean
  /**
   * `guide`: the page as the guide's own sample shows it, where the demo's `content` has grown since its screenshots
   * were taken; the guide keeps its sample as it is.
   */
  pages: { path: string; content: string; guide?: string }[]
}

/** A workspace and the files in its folder when the demo starts, so it opens with something in it. */
export type SeedWorkspace = {
  id: string; name: string; project: string; repoUrl: string | null; at: SeedMinutes
  files?: { path: string; content: string }[]
}

/** A file in a project's own storage, so a run's transcript names something that is there. */
export type SeedFile = { project: string; path: string; content: string }

/** A task's attachment, stored under the task by its uuid; `base64` is the file's bytes. */
export type SeedAttachmentFile = { task: string; uuid: string; fileName: string; base64: string }

/** An artefact an agent made in a project: one file, read back in the project's Artefacts. */
export type SeedArtefact = { project: string; name: string; content: string }

export type SeedSite = {
  workspaces: SeedWorkspace[]
  knowledge: SeedKnowledge[]
  files: SeedFile[]
  attachmentFiles: SeedAttachmentFile[]
  artefacts: SeedArtefact[]
}

export type DemoSeed = { organisation: SeedOrganisation; activity: SeedActivity; library: SeedLibrary; site: SeedSite }

/** The date a seed time stands for. */
export function seedTime(now: Date, minutes: SeedMinutes): Date {
  return new Date(now.getTime() + minutes * 60_000)
}
