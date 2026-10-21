import { parseRunStartedBy } from '@agenthix/core'
import { starterText } from '../sessions/runStarters'
import { starterOf, type RunStarter, type StarterNames, type StarterSource } from './runsView'

type TaskFactsSource = StarterSource & {
  title: string
  number: number
  onBehalfOfUserId: string
  runOnBehalfOfUserId: string | null
  project: { key: string; name: string }
}

/** What a task's run says about itself to the person reading it, in the words the panel and the Runs screen share. */
export function taskFacts(task: TaskFactsSource, me: string, names: StarterNames) {
  const runPerson = task.runOnBehalfOfUserId ?? task.onBehalfOfUserId
  const kind = parseRunStartedBy(task.runStartedBy)
  const name = (id: string | null) => (id && names.users.get(id)) || null
  // Who started it, only when it was not the viewer (spec §6), in the words a task's session uses.
  const startedByText = kind === 'person'
    ? (task.queuedByUserId === me ? null : starterText('person', name(task.queuedByUserId)))
    : starterText(kind, runPerson === me ? null : name(runPerson))
  const key = `${task.project.key}-${task.number}`
  return {
    title: task.title, ref: key, href: `/tasks/${key}`,
    place: { name: task.project.name, projectKey: task.project.key },
    startedBy: starterOf(task, names),
    onBehalfOf: { id: runPerson, name: names.users.get(runPerson) ?? 'Unknown' },
    startedByMe: task.queuedByUserId === me && task.runStartedBy === 'person',
    onMyBehalf: runPerson === me,
    startedByText,
  }
}

/** "by automation, for you": what started a run and whom it is for, the viewer reading as "you". */
export function startedByLine(starter: RunStarter, onBehalf: { id: string; name: string }, me: string): string | null {
  const who = (id: string | null, name: string | null) => (id === me ? 'you' : name ?? 'someone')
  let by: string | null
  switch (starter.kind) {
    case 'person': by = `by ${starter.name ?? 'someone'}`; break
    case 'agent': by = `by ${starter.name ?? 'an agent'}`; break
    case 'routine': by = 'by a routine'; break
    case 'schedule': by = 'on schedule'; break
    case 'automation': by = 'by automation'; break
    default: by = null
  }
  const forWhom = `for ${who(onBehalf.id, onBehalf.name)}`
  return by ? `${by}, ${forWhom}` : forWhom
}
