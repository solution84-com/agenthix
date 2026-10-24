/**
 * The reviewer (workflows spec part 1, *R2 · The reviewer*): one call to the organisation's default model, as the
 * one resolver gives it, made by hq itself with no tools. Its answer is read strictly (`answer.ts`). A failed call is
 * recorded and tried once more; a second failure leaves the version with no level and a note saying so. It never
 * holds up or decides an approval.
 */
import { generateText } from 'ai'
import { resolve } from '../../routing/resolver'
import { hqCallAccess } from '../../routing/reaching'
import { languageModelFor } from '../../conversations/model/providers'
import { turnUsageOf } from '../../conversations/model/usage'
import { recordHqCall } from '../../billing/sources/hqCalls'
import { costingOf } from '../../billing/costing'
import { readReviewAnswer } from './answer'
import { reviewRequest, type ReviewInput } from './prompt'
import { LEVEL_OF_WORD, type StoredReview } from './types'

export type ReviewLevel = (typeof LEVEL_OF_WORD)[keyof typeof LEVEL_OF_WORD]

/** One call to the model: the instruction and the document, and the model's text back. No tools are ever given. */
export type ReviewModel = { ask(request: { system: string; prompt: string; signal: AbortSignal }): Promise<string> }

export type ReviewOutcome = { level: ReviewLevel | null; review: StoredReview }

const CALL_TIMEOUT_MS = 120_000
const ANSWER_TOKENS_MAX = 1_500

/** The organisation's default model for hq's own call; null when none can be reached, with why. */
export async function organisationReviewModel(): Promise<{ model: ReviewModel } | { model: null; why: string }> {
  const req = { purpose: 'workflow_review' as const, place: { kind: 'organisation' as const } }
  const answer = await resolve(req)
  if (!answer.ok) return { model: null, why: answer.problem.message }
  const reached = await hqCallAccess(answer.resolution)
  if (!reached) return { model: null, why: 'HQ can\'t call the organisation\'s default model itself.' }
  const access = { ...reached, costing: costingOf(answer.resolution, req) }
  const model = languageModelFor(access)
  return {
    model: {
      async ask({ system, prompt, signal }) {
        const { text, usage } = await generateText({ model, system, prompt, maxOutputTokens: ANSWER_TOKENS_MAX, abortSignal: signal })
        recordHqCall(access, turnUsageOf(usage))
        return text
      },
    },
  }
}

const failedNote = (why: string) => `The reviewer couldn't read this version: ${why.replace(/\.?$/, '.')}`

/**
 * Asks the reviewer about one version, twice at most. `recordFailure` is told of a first failure before the retry,
 * so it is kept even if hq stops in between.
 */
export async function askReviewer(
  input: ReviewInput,
  getModel: () => Promise<{ model: ReviewModel } | { model: null; why: string }>,
  recordFailure: (outcome: ReviewOutcome) => Promise<void>,
): Promise<ReviewOutcome> {
  const { system, prompt } = reviewRequest(input)
  const files = input.content.files.map((f) => f.path)
  let why = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const got = await getModel()
      if (!got.model) throw new Error(got.why)
      const text = await got.model.ask({ system, prompt, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) })
      const answer = readReviewAnswer(text, files)
      return answer.readable
        ? { level: LEVEL_OF_WORD[answer.level], review: { points: answer.points } }
        : { level: LEVEL_OF_WORD[answer.level], review: { points: [], note: answer.note } }
    } catch (err) {
      why = err instanceof Error && err.message ? err.message : 'the call failed'
      if (attempt === 0) await recordFailure({ level: null, review: { points: [], note: `${failedNote(why)} Trying again.` } })
    }
  }
  return { level: null, review: { points: [], note: failedNote(why) } }
}
