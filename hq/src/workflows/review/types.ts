/**
 * What the reviewer (workflows spec part 1, *R2*) leaves on a version: a level, and up to five points each naming a
 * file and line — stored as `WorkflowVersion.reviewLevel` and `reviewPoints`. Advice only: nothing here decides what a
 * person is shown or whether the card may offer Approve.
 */
export type ReviewLevelWord = 'low' | 'look closely' | 'high'

export type ReviewPoint = { file: string; line: number; text: string }

/** `reviewPoints`: the points, or a note saying why there are none — an answer that couldn't be read, a failed call. */
export type StoredReview = { points: ReviewPoint[]; note?: string }

export const REVIEW_POINTS_MAX = 5

export const UNREADABLE_NOTE = 'The reviewer\'s answer couldn\'t be read.'

export const LEVEL_OF_WORD = { low: 'LOW', 'look closely': 'LOOK_CLOSELY', high: 'HIGH' } as const
