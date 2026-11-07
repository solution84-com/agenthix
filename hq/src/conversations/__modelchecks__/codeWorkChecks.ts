/**
 * The checks of how the lead gives code work (live preview spec, *Which work is code work*): work that changes a code
 * workspace's code is started in that workspace (start_work naming it), on the conversation's own branch, or given to
 * a task on it; the lead does not change the code itself, or start work in the project's files for it. And in a
 * conversation with its own branch, the person's ask to merge goes to the work there on the first ask (live preview
 * spec, *Merge into main*): its `merge_into_main` raises the card.
 */
import type { Check, Grade } from './checks'
import type { RunRecord } from './run'
import { CODE_WORKSPACE, WORKSPACES } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })

const argsOf = (input: unknown): Record<string, unknown> => (input && typeof input === 'object' ? (input as Record<string, unknown>) : {})

function calls(run: RunRecord): string {
  return run.calls.map(c => `${c.name}(${JSON.stringify(workspaceOf(c) ?? '')})`).join(', ') || 'no tool call'
}

/** The workspace a call names: start_work's `workspace`, create_task's `workspaceId`. */
function workspaceOf(c: RunRecord['calls'][number]): unknown {
  const args = argsOf(c.input)
  return c.name === 'start_work' ? args.workspace : args.workspaceId
}

function workInCodeWorkspace(run: RunRecord): Grade {
  const work = run.calls.filter(c => c.name === 'start_work' || c.name === 'create_task')
  if (work.length === 0) return fail(`no work started: ${calls(run)}`)
  const elsewhere = work.find(c => workspaceOf(c) !== CODE_WORKSPACE.id)
  return elsewhere ? fail(`${elsewhere.name} on ${String(workspaceOf(elsewhere) ?? 'no workspace')}, not ${CODE_WORKSPACE.name}: ${calls(run)}`) : PASS
}

/** The words a lead uses when it turns the person away instead of passing the ask on. */
const TURNED_AWAY = /\bmerge (?:it|the branch|your branch) yourself\b|\buse the Git panel\b/i

function mergePassedOn(run: RunRecord): Grade {
  const work = run.calls.find(c => c.name === 'start_work')
  if (!work) return fail(`no start_work to pass the merge on: ${run.calls.map(c => c.name).join(', ') || 'no tool call'}`)
  const brief = String(argsOf(work.input).brief ?? '')
  if (!/merge/i.test(brief)) return fail(`start_work's brief does not say to merge: "${brief.slice(0, 160)}"`)
  const words = run.texts.join(' ')
  if (TURNED_AWAY.test(words)) return fail(`told the person to merge it themselves: "${words.slice(0, 200)}"`)
  return PASS
}

export const CODE_WORK_CHECKS: readonly Check[] = [
  {
    id: 'code-in-workspace',
    title: 'Code work is started in the code workspace',
    setup: { home: 'project', message: `Add a login page to ${CODE_WORKSPACE.name}, now please.` },
    grade: workInCodeWorkspace,
  },
  {
    id: 'code-not-in-drafts',
    title: 'Code work is not put in a workspace without Git',
    setup: { home: 'project', message: 'Fix the broken sign-up button in the website app, and get on with it now.' },
    grade(run) {
      if (run.calls.some(c => workspaceOf(c) === WORKSPACES[1].id)) return fail(`put code work in ${WORKSPACES[1].name}: ${calls(run)}`)
      return workInCodeWorkspace(run)
    },
  },
  {
    id: 'code-merge-asked',
    title: 'The person\'s first ask to merge goes to the work in the workspace',
    setup: {
      home: 'project',
      branches: [{ branch: 'login-page', workspace: CODE_WORKSPACE.name, workspaceId: CODE_WORKSPACE.id }],
      before: [
        { role: 'person', text: 'Add a login page.' },
        { role: 'agent', text: 'The login page is done and committed on this conversation\'s branch. Have a look at it in the workspace.' },
      ],
      message: 'Looks good. Please merge your branch into main.',
    },
    grade: mergePassedOn,
  },
]
