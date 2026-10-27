/**
 * The checks of how the lead names files and tasks (spec part 3, *Chips in conversations*): a reference from the
 * place's root, which the thread draws as a chip, and never a web address.
 */
import { attachmentReference } from '../../shared/taskReferences'
import type { Check, Grade } from './checks'
import type { RunRecord } from './run'
import { TASK } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })

/** The run's words, every round: a reference may come in the step before the last. */
const said = (run: RunRecord) => run.texts.join('\n')
const ADDRESS = /https?:\/\/|www\.|\.app\b|<your-/i

function namesWithoutAddress(run: RunRecord, wanted: readonly string[]): Grade {
  const words = said(run)
  const address = ADDRESS.exec(words)
  if (address) return fail(`wrote an address ("${address[0]}"): ${words.slice(0, 300)}`)
  const missing = wanted.filter(w => !words.includes(w))
  return missing.length === 0 ? PASS : fail(`did not write ${missing.join(', ')}: ${words.slice(0, 300)}`)
}

export const FILE_CHECKS: readonly Check[] = [
  {
    id: 'task-attachment',
    title: "A task and its attachment, by reference",
    setup: { home: 'project', message: `Can you link me ${TASK.key} and its attachment?` },
    grade(run) {
      if (!run.calls.some(c => c.name === 'get_task_details')) return fail('answered without reading the task')
      return namesWithoutAddress(run, [`tasks/${TASK.key}`, attachmentReference(TASK.key, TASK.attachment)])
    },
  },
  {
    id: 'files-root',
    title: 'Paths inside Files, written from the root',
    setup: {
      home: 'project',
      message: 'I listed Files and got e2e-files/app.ts, e2e-files/README.md and notes.md. Which one is the readme? I want to click it.',
    },
    grade: run => namesWithoutAddress(run, ['files/e2e-files/README.md']),
  },
]
