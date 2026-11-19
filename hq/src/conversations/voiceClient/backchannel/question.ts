/**
 * Whether the person's words on screen end on a question (spec §The backchannel: no hum right after one), as well as
 * the words can say: a trailing "?", or, where speech to text has not punctuated it yet, a last sentence that opens as
 * a question does ("can you …", "what do you …"). A miss costs a hum not played, so it leans to "a question".
 */
const OPENS_AS_QUESTION = new RegExp(
  '^(?:(?:can|could|would|will|do|did|does|is|are|was|were|have|has|should|shall|may|might)\\s+(?:i|you|we|it|they|he|she|there|that|this)\\b'
  + '|(?:what|why|how|where|when|who|which)\\s+(?:do|does|did|is|are|was|were|should|would|could|can|will)\\b)',
  'i',
)

/** Words a question is often begun with before it opens: "and can you …", "so, what do you …". */
const LEADS = /^(?:(?:and|so|but|also|then|okay|ok|well|um|uh|hmm|like|oh)[\s,]+)+/i

export function endsOnQuestion(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/\?["')\]]*$/.test(t)) return true
  if (/[.!…]["')\]]*$/.test(t)) return false
  const last = t.split(/[.!?…]\s+/).at(-1)!.replace(/^[\s,"'(]+/, '').replace(LEADS, '')
  return OPENS_AS_QUESTION.test(last)
}
