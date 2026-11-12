/**
 * The tools a demo lead script may call (ADR-0186). A scripted call runs through hq's real tool, as the person in the
 * conversation, with the same permission checks as any lead's call; the Wasp-level demo guard does not see calls made
 * inside a turn, so the scripts are held here to making a task and starting a run, and to reading tasks, boards,
 * projects, what is running and Knowledge. Nothing that reaches outside hq or touches people, settings or the
 * machine. A script naming any other tool, or giving a call an input its tool would refuse, stops hq at start.
 */
import type { z } from 'zod'
import type { DemoScriptProblem, DemoScripts } from '@agenthix/core'
import { claimsStart, STARTS_WORK } from '../../conversations/coordinator/startedWords'

export const DEMO_LEAD_TOOLS: ReadonlySet<string> = new Set([
  'create_task',
  'run_task',
  'list_tasks',
  'get_task_details',
  'list_boards',
  'get_board',
  'open_board',
  'list_projects',
  'list_active_runs',
  'search_knowledge',
  'read_knowledge',
])

/** A lead tool's input schema by name, as a turn checks a call's arguments; null for a name no turn has. */
export type LeadToolInput = (name: string) => z.ZodType | null

/** Every problem with the scripts' tool calls, at once; empty when they all fit. */
export function demoLeadToolProblems(scripts: DemoScripts, inputOf: LeadToolInput): DemoScriptProblem[] {
  const problems: DemoScriptProblem[] = []
  for (const [handle, agent] of Object.entries(scripts.agents)) {
    for (const intent of agent.lead.intents) {
      const at = `agents/${handle}.json intent ${intent.id}`
      intent.toolCalls.forEach((call, i) => {
        const where = `${at} toolCalls[${i}]`
        const input = inputOf(call.toolName)
        if (!input) {
          problems.push({ at: where, message: `${call.toolName} is not a tool of the conversation lead` })
          return
        }
        if (!DEMO_LEAD_TOOLS.has(call.toolName)) {
          problems.push({ at: where, message: `${call.toolName} is not one the demo allows (${[...DEMO_LEAD_TOOLS].join(', ')})` })
          return
        }
        const parsed = input.safeParse(call.input)
        if (!parsed.success) {
          const issues = parsed.error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')
          problems.push({ at: where, message: `the input does not fit ${call.toolName}: ${issues}` })
        }
      })
      // A reply that says work started with no call that starts any would be sent back to the model, which is not there.
      if (claimsStart(intent.reply) && !intent.toolCalls.some(c => STARTS_WORK.has(c.toolName))) {
        problems.push({ at, message: 'the reply says work is starting, but no call starts any (create_task or run_task)' })
      }
    }
  }
  return problems
}
