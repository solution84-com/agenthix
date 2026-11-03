/**
 * The checks of how the lead gives code work (live preview spec, *Which work is code work*): work that changes a code
 * workspace's code goes to a task on that workspace, which works on a branch of its own; the lead does not change the
 * code itself, or start background work in the project for it. And in a conversation started in a code workspace, the
 * person's ask to merge goes to the work in that place on the first ask (live preview spec, *Merge into main*): its
 * `merge_into_main` raises the card.
 */
import type { Check, Grade } from './checks'
import type { RunRecord } from './run'
import { CODE_WORKSPACE, WORKSPACES } from './world'

const PASS: Grade = { passed: true }
const fail = (why: string): Grade => ({ passed: false, why })

const argsOf = (input: unknown): Record<string, unknown> => (input && typeof input === 'object' ? (input as Record<string, unknown>) : {})

function calls(run: RunRecord): string {
  return run.calls.map(c => `${c.name}(${JSON.stringify(argsOf(c.input).workspaceId ?? '')})`).join(', ') || 'no tool call'
}

function taskOnCodeWorkspace(run: RunRecord): Grade {
  if (run.calls.some(c => c.name === 'start_work')) return fail(`started background work instead of a task on the workspace: ${calls(run)}`)
  const task = run.calls.find(c => c.name === 'create_task')
  if (!task) return fail(`no create_task: ${calls(run)}`)
  const named = argsOf(task.input).workspaceId
  return named === CODE_WORKSPACE.id ? PASS : fail(`create_task on ${String(named ?? 'no workspace')}, not ${CODE_WORKSPACE.name}: ${calls(run)}`)
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
    id: 'code-task-workspace',
    title: 'Code work goes to a task on the code workspace',
    setup: { home: 'project', message: `Add a login page to ${CODE_WORKSPACE.name}, now please.` },
    grade: taskOnCodeWorkspace,
  },
  {
    id: 'code-not-in-drafts',
    title: 'Code work is not put in a workspace without Git',
    setup: { home: 'project', message: 'Fix the broken sign-up button in the website app, and get on with it now.' },
    grade(run) {
      const task = run.calls.find(c => c.name === 'create_task')
      if (task && argsOf(task.input).workspaceId === WORKSPACES[1].id) return fail(`put code work in ${WORKSPACES[1].name}: ${calls(run)}`)
      return taskOnCodeWorkspace(run)
    },
  },
  {
    id: 'code-merge-asked',
    title: 'The person\'s first ask to merge goes to the work in the workspace',
    setup: {
      home: 'project',
      workspace: { name: CODE_WORKSPACE.name, git: true },
      before: [
        { role: 'person', text: 'Add a login page.' },
        { role: 'agent', text: 'The login page is done and committed on this conversation\'s branch. Have a look at it in the workspace.' },
      ],
      message: 'Looks good. Please merge your branch into main.',
    },
    grade: mergePassedOn,
  },
]
