/**
 * A brief runs with nothing before it: the brief is the run's whole first message. Runs started before that carried
 * an opening in front of the brief, so a run is still known as a brief's when its input ends with it.
 */

/** Whether a run's input is this brief: as it is sent, or with the opening it once carried. */
export function isBriefInput(inputText: string, brief: string): boolean {
  return inputText === brief || inputText.endsWith(`\n\n${brief}`)
}
