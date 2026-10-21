/**
 * What a brief runs with before it: the background session is the conversation's own agent, not another, so it is
 * told who it is, whom it works for and where, and that its last reply is what that person will hear. Pure.
 */

export interface OpeningInput {
  agentName: string
  /** The person who asked, by the name they go by; null until they have set one. */
  personName: string | null
  /** The project the work is in; null for the person's own space. */
  projectName: string | null
}

export function briefOpening({ agentName, personName, projectName }: OpeningInput): string {
  const who = personName ?? 'the person'
  const where = projectName ? `the ${projectName} project` : `${personName ? `${personName}'s` : 'their'} own space`
  return [
    `You are ${agentName}, working in the background on something ${who} asked you for in your conversation with`,
    `them, in ${where}. What you finish with is what you will tell them: end with your whole result, in your own`,
    'voice, as you would say it to them.',
  ].join(' ')
}

export function withOpening(brief: string, opening: string): string {
  return `${opening}\n\n${brief}`
}

/** Whether a run's input is this brief: with its opening, or as it was sent before there was one. */
export function isBriefInput(inputText: string, brief: string): boolean {
  return inputText === brief || inputText.endsWith(`\n\n${brief}`)
}
