/**
 * The playground's second step after a listening style (adaptive voice listening, spec §The heavy model → *The listening
 * style as an action*): the playground's lead runs one step, but a reply that only called `set_listening_style` says
 * nothing in it, so the person would hear the style change silently. hq's turn answers the call and runs the next step,
 * where the reply says it will; so does the playground, only then: the step called the tool, held nothing and wrote no
 * words. Every call of the step is answered as hq's turn would tell the model: the style as set (or refused), and the
 * stand-in start_work as accepted.
 */
import type { LeadMessage, LeadToolCall } from '../../contract'
import { NOT_LISTENING, SET_LISTENING_STYLE, styleOf } from '../../lead/listeningStyle'

/** The messages that carry the step and its calls' answers to the next step; null when no next step is wanted. */
export function styleFollowUp(
  step: { text: string; calls: readonly LeadToolCall[]; held: boolean },
  applied: (call: LeadToolCall) => boolean,
): LeadMessage[] | null {
  const styled = step.calls.filter(c => c.name === SET_LISTENING_STYLE)
  if (step.held || step.text.trim() !== '' || styled.length === 0) return null
  const answers = step.calls.map((call): LeadMessage => {
    const style = call.name === SET_LISTENING_STYLE ? styleOf(call.input) : null
    const result = call.name !== SET_LISTENING_STYLE ? { operationId: `stand-in-${call.id}`, status: 'accepted' }
      : style && applied(call) ? { style, set: true }
        : { status: 'refused', reason: NOT_LISTENING.status === 'refused' ? NOT_LISTENING.reason : '' }
    return { role: 'tool', toolCallId: call.id, toolName: call.name, result }
  })
  return [{ role: 'assistant', content: step.text, toolCalls: [...step.calls] }, ...answers]
}
