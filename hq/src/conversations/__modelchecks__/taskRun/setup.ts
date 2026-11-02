/**
 * What a task's run on a branch is sent (W12 of the live preview walk): the parts of its prompt shared with the site
 * (core's `codeWorkPromptText` and `PLATFORM_TOOLS_INSTRUCTIONS`), its first message as hq gives it (`withBrief`), and
 * the platform tools a code-work run is offered, built from hq's own declarations, which the site forwards. The site's
 * identity and filesystem sections are the site's own, which hq cannot import: a short frame stands for them here.
 */
import { z, type ZodRawShape } from 'zod'
import { PLATFORM_TOOLS_INSTRUCTIONS, codeWorkPromptText, type RunOpenLivePreview } from '@agenthix/core'
import type { LeadMessage, LeadToolDefinition, PromptPart } from '../../contract'
import { ALL_CONTROL_PLANE_TOOLS } from '../../../server/controlplane/toolSchemas'
import { withBrief } from '../../taskThread/brief'
import { SHOP_TASK, WORKING_FOLDER, codeWork } from './world'

export interface TaskRunSetup {
  /** The branch's live preview when the run starts; null when none is open. */
  openLivePreview: RunOpenLivePreview | null
  behindMain?: number
  /** A person's ask passed on from the task's conversation, as the run's brief. */
  brief?: string
  /** Comments written on the task since the last run, newest last: who wrote each and what. */
  newComments?: readonly { author: string; text: string }[]
}

const FIRST_MESSAGE = 'Execute your assigned task.'

function frame(setup: TaskRunSetup): string {
  const lines = [
    'You are Kernel, an agent of this organisation, running one task.',
    '',
    '## Task',
    '',
    `Task ID: ${SHOP_TASK.id} (${SHOP_TASK.key})`,
    `Title: ${SHOP_TASK.title}`,
    `Description: ${SHOP_TASK.description}`,
  ]
  if (setup.newComments?.length) {
    lines.push('', '## New comments', '', 'Written on this task since your last run on it. They may direct this run.', '')
    for (const c of setup.newComments) lines.push(`${c.author}:`, c.text, '')
  }
  lines.push('', '## Filesystem', '', `- **Working directory (cwd):** \`${WORKING_FOLDER}\` — your working copy of your branch.`)
  return lines.join('\n')
}

export function taskRunContext(setup: TaskRunSetup): { system: PromptPart[]; messages: LeadMessage[] } {
  return {
    system: [
      { text: frame(setup) },
      { text: PLATFORM_TOOLS_INSTRUCTIONS },
      { text: codeWorkPromptText(codeWork(setup.openLivePreview, setup.behindMain ?? 0)) },
    ],
    messages: [{ role: 'user', content: withBrief(FIRST_MESSAGE, setup.brief ?? null) }],
  }
}

/** The harness's built-in file and command tools, as a run's harness offers them, in plain words. */
const BUILT_INS: LeadToolDefinition[] = [
  { name: 'read_file', description: 'Read a file in your working folder.', input: z.object({ file_path: z.string() }) },
  { name: 'write_file', description: 'Write a whole file.', input: z.object({ file_path: z.string(), content: z.string() }) },
  {
    name: 'edit_file', description: 'Replace text in a file.',
    input: z.object({ file_path: z.string(), old_string: z.string(), new_string: z.string() }),
  },
  { name: 'glob_files', description: 'Find files by a glob pattern.', input: z.object({ pattern: z.string() }) },
  { name: 'grep_files', description: 'Search file contents for a pattern.', input: z.object({ pattern: z.string(), path: z.string().optional() }) },
  { name: 'bash', description: 'Run a shell command in your working folder.', input: z.object({ command: z.string() }) },
]

/** The platform tools as the site shows them: the run's id is filled in by the site, so it is not the agent's to give. */
function shown(schema: ZodRawShape): z.ZodType {
  const { runId: _filledIn, ...rest } = schema
  return z.object(rest)
}

export function taskRunTools(): LeadToolDefinition[] {
  const platform = ALL_CONTROL_PLANE_TOOLS.map(t => ({ name: t.name, description: t.description ?? t.name, input: shown(t.schema) }))
  return [...BUILT_INS, ...platform]
}
