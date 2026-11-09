/**
 * How a word is said, for the speech service only: the written reply and what the person reads stay as written, and a
 * respelling stands in for the word in the text sent to be spoken. The speech model reads a name it does not know from
 * the words around it, so "Agenthix" came out right at the start of a sentence and wrong in the middle ("again-tex"); a
 * fixed respelling says it the same way each time. Chosen by ear.
 */
const RESPELLINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bAgenthix\b/gi, 'Agent-hicks'],
]

export function forSpeech(text: string): string {
  return RESPELLINGS.reduce((said, [word, spelling]) => said.replace(word, spelling), text)
}
