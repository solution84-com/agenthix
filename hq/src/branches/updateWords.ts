/**
 * What the agent is told after `update_from_main` and after a `commit` that a merge's clashes stopped (core's
 * `codeWork/updateTool.ts`): what happened, and the one thing to do next. Written for the baseline model.
 */

/** The most paths named in a note; the answer's `paths` holds them all. */
const NAMED_MAX = 20

function named(paths: readonly string[]): string {
  const shown = paths.slice(0, NAMED_MAX).join(', ')
  return paths.length > NAMED_MAX ? `${shown} and ${paths.length - NAMED_MAX} more` : shown
}

type Words = { branch: string; main: string }
type Outcome = 'updated' | 'up_to_date' | 'uncommitted' | 'clashes' | 'merge_under_way'

export function updateNote(outcome: Outcome, w: Words, paths: readonly string[] = []): string {
  switch (outcome) {
    case 'updated':
      return `${w.main} is merged into ${w.branch}, and the branch is back in the workspace. Check the work still works, then tell the person it is up to date with ${w.main}.`
    case 'up_to_date':
      return `${w.branch} already has everything ${w.main} has. Nothing was changed.`
    case 'uncommitted':
      return `Your working folder has changes you have not committed. Call commit first, then call update_from_main again. Nothing was changed.`
    case 'clashes':
      return `Merging ${w.main} into ${w.branch} left clashes in: ${named(paths)}. Each of these files now holds Git's conflict markers ` +
        '(<<<<<<<, =======, >>>>>>>). Edit each one so it keeps what both sides meant and has no markers left, check the work ' +
        'still works, then call commit: that commit finishes the merge.'
    case 'merge_under_way':
      return `A merge of ${w.main} is already under way. These files still clash: ${named(paths)}. Resolve their conflict markers, ` +
        'then call commit to finish it. Nothing was changed.'
  }
}

export function clashesLeftNote(paths: readonly string[]): string {
  return `Nothing was committed: you are finishing a merge from main, and these files still hold conflict markers: ${named(paths)}. ` +
    'Edit them so no <<<<<<<, ======= or >>>>>>> lines are left, then call commit again.'
}
