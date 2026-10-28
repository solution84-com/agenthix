/**
 * The one permission policy for the Library and skills (adr-0157, adr-0159; spec part 2 *History and Library
 * maintainers*, part 4 *Who acts on a place's skills*, part 5 *Proposing*). Every operation that changes an asset, a
 * place's skills or their settings asks `may` or `assertMay`; none checks a role of its own. Pure.
 *
 * - **The organisation's Library:** administrators do everything. Library maintainers install from hq's image,
 *   accept updates, roll back, edit and publish, and review proposals; they install from outside only when the
 *   organisation lets them (P3). Removing, choosing which agents have an asset, trusting publishers, naming
 *   maintainers and the settings stay with administrators.
 * - **A project's skills:** writing is open, publishing is the control. Its members edit drafts and add skills to the
 *   place; its administrators publish, roll back, remove, review and set its default. An organisation administrator
 *   who doesn't administer the project has no say there (D32).
 * - **Your space:** the person does everything there, and nobody else does.
 * - **An agent** acting for a person only ever edits a draft (through `propose_skill`), and only where that person
 *   may. Publishing, rolling back, installing, trusting, naming maintainers and settings become approval cards (D31).
 */

export const ASSET_ACTIONS = [
  'install', 'installFromOutside', 'update', 'rollBack', 'editDraft', 'publish', 'remove', 'grant', 'reviewProposal',
  'trust', 'nameMaintainer', 'settings',
] as const
export type AssetAction = (typeof ASSET_ACTIONS)[number]

export type PersonActor = {
  kind: 'person'
  userId: string
  /** The organisation role; null for an account with none. */
  role: 'ADMIN' | 'MEMBER' | null
  libraryMaintainer: boolean
  /** The person's role in the target project, for a project target. */
  projectRole: 'ADMIN' | 'MEMBER' | 'VIEWER' | null
}

export type AgentActor = {
  kind: 'agent'
  agentId: string
  /** The person the run acts for, from its on-behalf-of record, never a tool argument; null when there is none. */
  forUserId: string | null
  runId: string | null
  /** That person, resolved against the same target. */
  person: PersonActor | null
}

export type Actor = PersonActor | AgentActor

export type PolicyTarget =
  | { level: 'organisation'; outsideInstallers: 'ADMINS' | 'ADMINS_AND_MAINTAINERS' }
  | { level: 'project'; projectId: string }
  | { level: 'person'; userId: string }

const MAINTAINED: readonly AssetAction[] = ['install', 'update', 'rollBack', 'editDraft', 'publish', 'reviewProposal']
const PROJECT_MEMBERS: readonly AssetAction[] = ['install', 'editDraft']
const PROJECT_ADMINS: readonly AssetAction[] = [...PROJECT_MEMBERS, 'publish', 'rollBack', 'remove', 'reviewProposal', 'settings']
const OWN_SPACE: readonly AssetAction[] = ['install', 'editDraft', 'publish', 'rollBack', 'remove', 'reviewProposal', 'settings']

function personMay(actor: PersonActor, action: AssetAction, target: PolicyTarget): boolean {
  switch (target.level) {
    case 'organisation':
      if (actor.role === 'ADMIN') return true
      if (actor.role !== 'MEMBER' || !actor.libraryMaintainer) return false
      if (action === 'installFromOutside') return target.outsideInstallers === 'ADMINS_AND_MAINTAINERS'
      return MAINTAINED.includes(action)
    case 'project':
      if (actor.role === null) return false
      if (actor.projectRole === 'ADMIN') return PROJECT_ADMINS.includes(action)
      if (actor.projectRole === 'MEMBER') return PROJECT_MEMBERS.includes(action)
      return false
    case 'person':
      return actor.userId === target.userId && OWN_SPACE.includes(action)
  }
}

export function may(actor: Actor, action: AssetAction, target: PolicyTarget): boolean {
  if (actor.kind === 'person') return personMay(actor, action, target)
  return action === 'editDraft' && actor.person !== null && actor.person.userId === actor.forUserId && personMay(actor.person, action, target)
}

const WHAT: Record<AssetAction, string> = {
  install: 'Installing from Agenthix',
  installFromOutside: 'Installing from outside the Library',
  update: 'Accepting an update',
  rollBack: 'Rolling back',
  editDraft: 'Editing a skill',
  publish: 'Publishing',
  remove: 'Removing',
  grant: 'Choosing which agents have it',
  reviewProposal: 'Reviewing proposals',
  trust: 'Trusting a publisher',
  nameMaintainer: 'Naming Library maintainers',
  settings: 'Changing these settings',
}

const NOTHING = 'Nothing was changed.'

/** What the person is told when `may` says no: what, who holds it, what to do. */
export function refusal(actor: Actor, action: AssetAction, target: PolicyTarget): string {
  if (actor.kind === 'agent') return `${WHAT[action]} is for a person: an agent can only draft, and a person approves. ${NOTHING}`
  switch (target.level) {
    case 'organisation': {
      const maintainers = action === 'installFromOutside' ? target.outsideInstallers === 'ADMINS_AND_MAINTAINERS' : MAINTAINED.includes(action)
      return maintainers
        ? `${WHAT[action]} is for administrators and Library maintainers. Ask one of them. ${NOTHING}`
        : `${WHAT[action]} is for administrators. Ask an administrator. ${NOTHING}`
    }
    case 'project':
      return PROJECT_MEMBERS.includes(action)
        ? `${WHAT[action]} is for this project's members. Ask a project administrator to add you. ${NOTHING}`
        : `${WHAT[action]} is for this project's administrators. Ask one of them. ${NOTHING}`
    case 'person':
      return `Only the person whose space it is can do this. ${NOTHING}`
  }
}

export class PolicyError extends Error {}

export function assertMay(actor: Actor, action: AssetAction, target: PolicyTarget): void {
  if (!may(actor, action, target)) throw new PolicyError(refusal(actor, action, target))
}
