import { describe, expect, it } from 'vitest'
import { demoClosingLineOf, demoWords, matchDemoIntent, pickDemoRunScript } from '../match.js'
import type { DemoIntent, DemoRunScript } from '../scripts.js'

const intent = (id: string, phrasings: string[]): DemoIntent => ({ id, phrasings, reply: `${id} reply`, toolCalls: [], voiceClip: null })

const WRITER: DemoIntent[] = [
  intent('draft-homepage', ['Draft the homepage copy', 'Write the words for the home page', 'Can you write our homepage text?']),
  intent('start-task', ['Start a task to write the launch email', 'Make a task for the launch announcement', 'Create a task']),
  intent('status', ['What are you working on?', "What's the status of your work?", 'How is the report going?']),
  intent('shorten', ['Make this shorter', 'Cut the intro down', 'Shorten the summary to one paragraph']),
]

describe('demo words @SC-1984', () => {
  it('ignores case, punctuation and common stop words, and folds plurals', () => {
    expect(demoWords('Can you write OUR homepage text?!')).toEqual(['write', 'homepage', 'text'])
    expect(demoWords('the tasks, please')).toEqual(['task'])
    expect(demoWords("What's the status?")).toEqual(['status'])
  })
})

describe('matching a visitor message to an intent @SC-1984', () => {
  const match = (message: string) => matchDemoIntent(message, WRITER)?.id ?? null

  it('finds the intent of real-looking messages', () => {
    expect(match('hey could you draft some homepage copy for us')).toBe('draft-homepage')
    expect(match('Please write the home page')).toBe('draft-homepage')
    expect(match('start a new task for the launch email')).toBe('start-task')
    expect(match('create tasks')).toBe('start-task')
    expect(match('what are you working on right now?')).toBe('status')
    expect(match('how is the report going')).toBe('status')
    expect(match('can you shorten the summary')).toBe('shorten')
  })

  it('gives no intent below the threshold, so the agent says its fallback', () => {
    expect(match('what is the weather in Lisbon tomorrow')).toBeNull()
    expect(match('tell me a joke')).toBeNull()
    expect(match('')).toBeNull()
    expect(match('?!? ...')).toBeNull()
    expect(match('the and of to')).toBeNull()
  })

  it('is deterministic: on a tie the earlier intent wins', () => {
    const tied = [intent('first', ['open the board']), intent('second', ['open the board'])]
    for (let i = 0; i < 5; i++) expect(matchDemoIntent('open the board', tied)?.id).toBe('first')
  })

  it('matches a message made only of stop words, such as "What can you do?"', () => {
    const kernel = [intent('what-can-you-do', ['What can you do?', 'Who are you?']), ...WRITER]
    expect(matchDemoIntent('What can you do?', kernel)?.id).toBe('what-can-you-do')
    expect(matchDemoIntent('what can you do', kernel)?.id).toBe('what-can-you-do')
    expect(matchDemoIntent('Who are you', kernel)?.id).toBe('what-can-you-do')
  })

  it('keeps a task key whole, so two tasks do not match the same intent', () => {
    expect(demoWords('Check on WEB-3')).toEqual(['web-3', 'check'])
    const tasks = [intent('web-3', ['Check on WEB-3']), intent('web-7', ['Check on WEB-7'])]
    expect(matchDemoIntent('how is web-7 doing', tasks)?.id).toBe('web-7')
  })

  it('matches nothing when the agent has no intents', () => {
    expect(matchDemoIntent('draft the homepage', [])).toBeNull()
  })
})

describe('picking a run script @SC-1984', () => {
  const run = (id: string, target: DemoRunScript['for']): DemoRunScript =>
    ({ format: 1, id, for: target, events: [], files: [], end: { status: 'completed' } })
  const runs = [run('general', { default: true }), run('launch-step', { taskType: 'Launch step' }), run('web-3', { task: 'WEB-3' })]

  it("takes the task's own script, then its type's, then the default", () => {
    expect(pickDemoRunScript(runs, { taskKey: 'WEB-3', taskType: 'Launch step' })?.id).toBe('web-3')
    expect(pickDemoRunScript(runs, { taskKey: 'WEB-4', taskType: 'Launch step' })?.id).toBe('launch-step')
    expect(pickDemoRunScript(runs, { taskKey: 'WEB-4', taskType: 'Task' })?.id).toBe('general')
    expect(pickDemoRunScript(runs, {})?.id).toBe('general')
  })

  it('gives none when there is no script and no default', () => {
    expect(pickDemoRunScript([], {})).toBeNull()
  })
})

describe("the lead's closing line of a message @SC-1984", () => {
  const spoken = {
    workCameBack: { text: 'That work has come back.', voiceClip: 'writer-work-came-back.mp3' },
    done: { text: "That's started.", voiceClip: 'writer-done.mp3' },
    refused: { text: "That didn't go through.", voiceClip: 'writer-refused.mp3' },
    waiting: { text: 'It is waiting for your okay above.', voiceClip: null },
  }

  it('finds the line a message says, and the refused line that opens a refusal', () => {
    expect(demoClosingLineOf({ spoken }, "That's started.")).toBe(spoken.done)
    expect(demoClosingLineOf({ spoken }, ' That work has come back. ')).toBe(spoken.workCameBack)
    expect(demoClosingLineOf({ spoken }, "That didn't go through. You can only read Website relaunch.")).toBe(spoken.refused)
  })

  it('finds none for any other message', () => {
    expect(demoClosingLineOf({ spoken }, 'The home page copy is in progress.')).toBeNull()
  })
})
